import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as jpeg from 'jpeg-js';
import { Asset } from '../types';

/**
 * Isolated image-analysis helpers. Kept separate from strategies so
 * strategies stay declarative ("what counts as a match") while this file
 * stays the only place doing actual pixel work.
 *
 * Real analysis, not a stub: each photo is resized down to a small JPEG
 * via expo-image-manipulator, decoded in pure JS via jpeg-js, and
 * brightness/blur/a perceptual hash are all derived from that ONE shared
 * decode — never three separate native round trips for the same photo.
 * Results are cached per asset id (see below), since a photo can
 * otherwise get analyzed repeatedly across the Categories preview pass,
 * a slider drag, and the actual swipe session.
 */

export interface ImageAnalysis {
  brightness: number; // 0-255, average luma
  blurScore: number; // 0 (sharp) - 100 (very blurry)
  dHash: string; // 16 hex chars = 64-bit difference hash, for near-duplicate detection
}

// 200px is wide enough for real edge structure to survive (blur detection
// needs actual gradients, not a handful of pixels) while still decoding
// in a few ms — this is the one size used for brightness AND blur; the
// perceptual hash below downsamples further from this same buffer rather
// than triggering a second native resize.
const RESIZE_WIDTH = 200;

// A 9x8 grid gives 8 horizontal neighbor-comparisons per row x 8 rows =
// 64 bits — small enough to compare via two 32-bit ints (see
// hammingDistance) instead of BigInt, which matters for the O(n^2)
// duplicate-comparison pass in DuplicatesAndSimilarStrategy.
const HASH_COLS = 9;
const HASH_ROWS = 8;

// expo-image-manipulator's native pipeline decodes the FULL-RESOLUTION
// source image before resizing (confirmed from its own source — there's
// no downsampled-decode shortcut), so a 12-48MP photo means real
// transient native memory per decode. This is deliberately conservative,
// not maxed out to whatever the device could theoretically sustain.
const CONCURRENCY = 3;

interface CacheEntry {
  analysis: ImageAnalysis;
  lastSeenAt: number;
}

const CACHE_KEY = '@swipix/imageAnalysisCache';

// A photo dropped from the library (deleted, or simply not paginated into
// view again for a long time) stops getting its lastSeenAt refreshed —
// without a cap this cache would otherwise grow forever, one entry per
// photo ever analyzed across the app's lifetime. This isn't a full
// library reconciliation (that would mean re-fetching everything, exactly
// what pagination exists to avoid) — it's a simple LRU-style bound.
export const MAX_CACHE_ENTRIES = 5000;

let memoryCache: Map<string, CacheEntry> | null = null;
let cacheDirty = false;

async function ensureCacheLoaded(): Promise<Map<string, CacheEntry>> {
  if (memoryCache) return memoryCache;
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  memoryCache = new Map(raw ? Object.entries(JSON.parse(raw)) : []);
  return memoryCache;
}

function evictLeastRecentlySeen(cache: Map<string, CacheEntry>): void {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  const byAge = [...cache.entries()].sort((a, b) => a[1].lastSeenAt - b[1].lastSeenAt);
  const excess = cache.size - MAX_CACHE_ENTRIES;
  for (let i = 0; i < excess; i++) cache.delete(byAge[i][0]);
  cacheDirty = true;
}

async function flushCacheIfDirty(): Promise<void> {
  if (!cacheDirty || !memoryCache) return;
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(memoryCache)));
  cacheDirty = false;
}

/**
 * The single entry point strategies use — never call the pixel pipeline
 * directly per-strategy, or brightness, blur, and the duplicate hash
 * would each trigger their own native decode of the same photo. Skips
 * videos (can't decode as an image) and anything already cached; writes
 * the cache once per call, not once per photo, since AsyncStorage's
 * single-blob-per-key pattern (matching TrashService/KeptService)
 * serializes the whole cache on every write.
 *
 * Known limitation: cache invalidation is id-only, not content-based —
 * editing a photo in Photos.app after it's been cached here won't be
 * detected. Threading MediaLibrary's modificationTime through the app's
 * shared Asset type just for this rare case isn't worth it for v1.
 */
export async function analyzeImages(assets: Asset[]): Promise<Map<string, ImageAnalysis>> {
  const cache = await ensureCacheLoaded();
  const photoAssets = assets.filter((asset) => asset.mediaType === 'photo');
  const misses = photoAssets.filter((asset) => !cache.has(asset.id));
  const now = Date.now();

  // Touch every hit's lastSeenAt (in memory only — deliberately NOT marked
  // dirty here) so eviction below favors photos the app hasn't looked at
  // in a while, not just insertion order. Not flushing on every touch
  // preserves the "write once per call that found something new" property
  // above; a touch-only call's freshened timestamps just ride along with
  // the next miss-triggered flush. Worst case, a restart before that
  // happens means eviction judges by a slightly stale timestamp — fine
  // for a heuristic cache bound, not worth a write on every call for.
  for (const asset of photoAssets) {
    const existing = cache.get(asset.id);
    if (existing) existing.lastSeenAt = now;
  }

  await mapWithConcurrency(misses, CONCURRENCY, async (asset) => {
    const result = await analyzeOne(asset.uri);
    if (result) {
      cache.set(asset.id, { analysis: result, lastSeenAt: now });
      cacheDirty = true;
    }
  });

  evictLeastRecentlySeen(cache);
  await flushCacheIfDirty();

  const analyses = new Map<string, ImageAnalysis>();
  for (const [id, entry] of cache) analyses.set(id, entry.analysis);
  return analyses;
}

/**
 * Hamming distance (bit-difference count) between two dHash values, for
 * deciding whether two photos are visually similar. Exported so
 * DuplicatesAndSimilarStrategy doesn't need to know the hash's internal
 * hi/lo-uint32 packing to compare two of them.
 */
export function hammingDistance(a: string, b: string): number {
  const aHi = parseInt(a.slice(0, 8), 16);
  const aLo = parseInt(a.slice(8), 16);
  const bHi = parseInt(b.slice(0, 8), 16);
  const bLo = parseInt(b.slice(8), 16);
  return popcount32((aHi ^ bHi) >>> 0) + popcount32((aLo ^ bLo) >>> 0);
}

// Commonly-cited dHash literature treats <=4 bits as "near identical" and
// <=10 as "visually similar" — a starting point, not a guarantee. Tune
// against this app's own duplicate pairs during real-device testing
// rather than trusting it blindly (see issue #10).
export const HAMMING_THRESHOLD = 8;

/** Resize -> decode -> derive luma -> compute all three signals from
 * that one buffer. Swallows all failures (corrupt file, unsupported
 * codec) and returns null: a photo we can't decode should just never
 * appear in brightness/blur/duplicate categories, not break match() for
 * every other photo in the library. */
async function analyzeOne(uri: string): Promise<ImageAnalysis | null> {
  let tmpUri: string | null = null;
  try {
    const image = await ImageManipulator.manipulate(uri).resize({ width: RESIZE_WIDTH }).renderAsync();
    const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 1 });
    tmpUri = result.uri;

    const bytes = await new File(tmpUri).bytes();
    const { width, height, data } = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });

    const luma = toLuma(data, width, height);
    return {
      brightness: averageBrightness(luma),
      blurScore: laplacianBlurScore(luma, width, height),
      dHash: differenceHash(luma, width, height),
    };
  } catch {
    return null;
  } finally {
    if (tmpUri) {
      try {
        new File(tmpUri).delete();
      } catch {
        // Best-effort cleanup of the resized temp file — a leftover
        // cache-dir file is harmless, not worth surfacing.
      }
    }
  }
}

/** Standard ITU-R BT.601 grayscale weights — the same ones used for
 * brightness averaging and edge-detection alike, not something to
 * reinvent per use case. */
export function toLuma(rgba: Uint8Array, width: number, height: number): Float32Array {
  const luma = new Float32Array(width * height);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    luma[p] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }
  return luma;
}

export function averageBrightness(luma: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < luma.length; i++) sum += luma[i];
  return sum / luma.length;
}

// Discrete Laplacian kernel [[0,1,0],[1,-4,1],[0,1,0]] — high response
// variance means lots of high-frequency edge content (sharp); low
// variance means smooth/blurry. There's no universal variance-to-
// "blurriness" mapping (it depends on sensor/resolution/compression),
// so BLUR_VARIANCE_SCALE is a starting guess, not a calibrated constant
// — tune it (and BlurredImagesStrategy's BLUR_THRESHOLD) against a real
// mix of sharp/blurry photos before trusting the cutoff (see issue #10).
const BLUR_VARIANCE_SCALE = 1000;

export function laplacianVariance(luma: Float32Array, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const response = luma[i - width] + luma[i + width] + luma[i - 1] + luma[i + 1] - 4 * luma[i];
      sum += response;
      sumSq += response * response;
      count++;
    }
  }
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

export function laplacianBlurScore(luma: Float32Array, width: number, height: number): number {
  const variance = laplacianVariance(luma, width, height);
  const sharpness = Math.min(variance / BLUR_VARIANCE_SCALE, 1); // 0 = blurry .. 1 = sharp
  return Math.round((1 - sharpness) * 100); // invert onto the existing 0(sharp)-100(blurry) scale
}

/** Difference hash (dHash): downsample the already-decoded luma buffer
 * to a small grid (point-sampled — no second native resize) and compare
 * each pixel to its right neighbor. Packed into two uint32 halves
 * instead of a BigInt, since the duplicate-detection comparison pass
 * runs this O(n^2) across the whole library. */
export function differenceHash(luma: Float32Array, width: number, height: number): string {
  const small = new Float32Array(HASH_COLS * HASH_ROWS);
  for (let y = 0; y < HASH_ROWS; y++) {
    for (let x = 0; x < HASH_COLS; x++) {
      const sourceX = Math.min(width - 1, Math.floor((x * width) / HASH_COLS));
      const sourceY = Math.min(height - 1, Math.floor((y * height) / HASH_ROWS));
      small[y * HASH_COLS + x] = luma[sourceY * width + sourceX];
    }
  }

  let hi = 0;
  let lo = 0;
  let bit = 0;
  for (let y = 0; y < HASH_ROWS; y++) {
    for (let x = 0; x < HASH_COLS - 1; x++) {
      const bitValue = small[y * HASH_COLS + x] < small[y * HASH_COLS + x + 1] ? 1 : 0;
      if (bit < 32) {
        hi = (hi << 1) | bitValue;
      } else {
        lo = (lo << 1) | bitValue;
      }
      bit++;
    }
  }
  return (hi >>> 0).toString(16).padStart(8, '0') + (lo >>> 0).toString(16).padStart(8, '0');
}

export function popcount32(x: number): number {
  x -= (x >> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >> 24;
}

/** Runs `fn` over `items` with at most `limit` in flight at once —
 * bounded concurrency, not full parallelism, since each in-flight call
 * here means a real native image decode (see CONCURRENCY's comment). */
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}
