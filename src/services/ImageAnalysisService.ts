import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as jpeg from 'jpeg-js';
import { Asset } from '../types';

/**
 * Isolated image-analysis helpers, kept separate from strategies so those
 * stay declarative and this is the only file doing real pixel work.
 *
 * @remarks
 * Each photo is resized to a small JPEG, decoded once via jpeg-js, and
 * brightness/blur/a perceptual hash are all derived from that one shared
 * decode — never three separate native round trips per photo. Results are
 * cached per asset id.
 */

export interface ImageAnalysis {
  /** 0-255, average luma. */
  brightness: number;
  /** 0 (sharp) to 100 (very blurry). */
  blurScore: number;
  /** 16 hex chars = 64-bit difference hash, for near-duplicate detection. */
  dHash: string;
}

// Wide enough for real edge structure to survive blur detection, small
// enough to decode in a few ms. Also feeds the perceptual hash below, so
// there's no second native resize.
const RESIZE_WIDTH = 200;

// 9x8 grid = 64 bits, packed as two uint32s (see hammingDistance) instead
// of BigInt — matters for the O(n^2) pass in DuplicatesAndSimilarStrategy.
const HASH_COLS = 9;
const HASH_ROWS = 8;

// expo-image-manipulator decodes the full-resolution source before
// resizing, so a 12-48MP photo means real transient native memory per
// decode — kept conservative rather than maxed out.
const CONCURRENCY = 3;

interface CacheEntry {
  analysis: ImageAnalysis;
  lastSeenAt: number;
}

const CACHE_KEY = '@swipix/imageAnalysisCache';

// Simple LRU-style bound — a photo no longer in view stops getting its
// lastSeenAt refreshed, so without a cap this would grow forever.
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
 * Single entry point strategies use for brightness/blur/duplicate-hash
 * data — never call the pixel pipeline directly per-signal. Skips videos
 * and anything already cached; writes the cache once per call, not once
 * per photo.
 *
 * @remarks
 * Cache invalidation is id-only, not content-based — editing a photo in
 * Photos.app after it's cached here won't be detected.
 */
export async function analyzeImages(assets: Asset[]): Promise<Map<string, ImageAnalysis>> {
  const cache = await ensureCacheLoaded();
  const photoAssets = assets.filter((asset) => asset.mediaType === 'photo');
  const misses = photoAssets.filter((asset) => !cache.has(asset.id));
  const now = Date.now();

  // Touch hits' lastSeenAt in memory only (not marked dirty) so eviction
  // favors recently-seen photos — rides along with the next real flush.
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

/** Bit-difference count between two dHash values, for deciding whether two
 * photos are visually similar. */
export function hammingDistance(a: string, b: string): number {
  const aHi = parseInt(a.slice(0, 8), 16);
  const aLo = parseInt(a.slice(8), 16);
  const bHi = parseInt(b.slice(0, 8), 16);
  const bLo = parseInt(b.slice(8), 16);
  return popcount32((aHi ^ bHi) >>> 0) + popcount32((aLo ^ bLo) >>> 0);
}

// <=4 bits "near identical", <=10 "visually similar" per common dHash
// literature — a starting point, not calibrated against this app's own
// photos yet (see issue #10).
export const HAMMING_THRESHOLD = 8;

/** Resize, decode, derive luma, compute all three signals from that one
 * buffer. Swallows failures and returns null — an undecodable photo
 * should just never appear in brightness/blur/duplicate categories. */
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
        // Best-effort cleanup — a leftover temp file is harmless.
      }
    }
  }
}

/** Standard ITU-R BT.601 grayscale weights. */
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

// Discrete Laplacian kernel — high response variance means lots of edge
// content (sharp), low variance means smooth/blurry. Not a calibrated
// constant (depends on sensor/resolution/compression); tune alongside
// BlurredImagesStrategy's BLUR_THRESHOLD against real photos (issue #10).
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
  const sharpness = Math.min(variance / BLUR_VARIANCE_SCALE, 1); // 0 blurry .. 1 sharp
  return Math.round((1 - sharpness) * 100); // onto the 0(sharp)-100(blurry) scale
}

/** Downsamples the already-decoded luma buffer to a small grid
 * (point-sampled, no second native resize) and compares each pixel to its
 * right neighbor. Packed into two uint32s since duplicate detection runs
 * this O(n^2) across the library. */
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

/** Runs `fn` over `items` with at most `limit` in flight — each in-flight
 * call is a real native image decode (see {@link CONCURRENCY}). */
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
