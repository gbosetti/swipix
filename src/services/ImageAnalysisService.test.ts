import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  toLuma,
  averageBrightness,
  laplacianVariance,
  laplacianBlurScore,
  differenceHash,
  hammingDistance,
  popcount32,
  analyzeImages,
  MAX_CACHE_ENTRIES,
} from './ImageAnalysisService';
import { Asset } from '../types';

/** Builds a synthetic RGBA buffer for a solid color — the simplest case
 * for verifying brightness/luma math without needing a real JPEG. */
function solidRgba(width: number, height: number, r: number, g: number, b: number): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return data;
}

/** Builds a synthetic checkerboard RGBA buffer — sharp, high-contrast
 * edges everywhere, the opposite case from a solid color. */
function checkerboardRgba(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = (x + y) % 2 === 0 ? 255 : 0;
      const i = (y * width + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe('toLuma', () => {
  it('converts a solid-color RGBA buffer to a uniform luma value', () => {
    const rgba = solidRgba(4, 4, 200, 200, 200);
    const luma = toLuma(rgba, 4, 4);
    expect(luma.length).toBe(16);
    for (let i = 0; i < luma.length; i++) {
      expect(luma[i]).toBeCloseTo(200, 5);
    }
  });

  it('applies ITU-R BT.601 weights, not a plain average, for colored pixels', () => {
    // Pure green should read brighter than pure blue at the same 255
    // value, since luma weights green (0.587) far higher than blue (0.114).
    const green = toLuma(solidRgba(1, 1, 0, 255, 0), 1, 1)[0];
    const blue = toLuma(solidRgba(1, 1, 0, 0, 255), 1, 1)[0];
    expect(green).toBeGreaterThan(blue);
  });
});

describe('averageBrightness', () => {
  it('returns the exact value for a uniform buffer', () => {
    const luma = new Float32Array(9).fill(128);
    expect(averageBrightness(luma)).toBe(128);
  });

  it('averages mixed values', () => {
    const luma = Float32Array.from([0, 255, 0, 255]);
    expect(averageBrightness(luma)).toBe(127.5);
  });
});

describe('laplacianVariance / laplacianBlurScore', () => {
  it('gives near-zero variance for a flat/solid image (blurry)', () => {
    const luma = toLuma(solidRgba(10, 10, 128, 128, 128), 10, 10);
    const variance = laplacianVariance(luma, 10, 10);
    expect(variance).toBeCloseTo(0, 5);
  });

  it('gives high variance for a checkerboard image (sharp)', () => {
    const luma = toLuma(checkerboardRgba(10, 10), 10, 10);
    const variance = laplacianVariance(luma, 10, 10);
    expect(variance).toBeGreaterThan(1000);
  });

  it('scores a flat image near 100 (very blurry) on the 0-100 scale', () => {
    const luma = toLuma(solidRgba(10, 10, 128, 128, 128), 10, 10);
    expect(laplacianBlurScore(luma, 10, 10)).toBeGreaterThanOrEqual(99);
  });

  it('scores a checkerboard image near 0 (sharp) on the 0-100 scale', () => {
    const luma = toLuma(checkerboardRgba(10, 10), 10, 10);
    expect(laplacianBlurScore(luma, 10, 10)).toBeLessThanOrEqual(1);
  });
});

describe('differenceHash / hammingDistance', () => {
  it('produces a 16-character hex string', () => {
    const luma = toLuma(checkerboardRgba(20, 20), 20, 20);
    const hash = differenceHash(luma, 20, 20);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('gives identical hashes (Hamming distance 0) for identical images', () => {
    const lumaA = toLuma(checkerboardRgba(20, 20), 20, 20);
    const lumaB = toLuma(checkerboardRgba(20, 20), 20, 20);
    const hashA = differenceHash(lumaA, 20, 20);
    const hashB = differenceHash(lumaB, 20, 20);
    expect(hashA).toBe(hashB);
    expect(hammingDistance(hashA, hashB)).toBe(0);
  });

  it('gives a small but nonzero distance for a minor variation', () => {
    // A solid gray image (every dHash bit 0, no ambiguity) against the
    // same image with only its right third brightened — a step, not a
    // periodic pattern, so unlike a checkerboard it can't alias against
    // the hash's downsampling stride. Only the columns straddling the
    // step should flip.
    const width = 20;
    const height = 20;
    const base = solidRgba(width, height, 128, 128, 128);
    const varied = solidRgba(width, height, 128, 128, 128);
    for (let y = 0; y < height; y++) {
      for (let x = Math.floor((width * 2) / 3); x < width; x++) {
        const i = (y * width + x) * 4;
        varied[i] = 255;
        varied[i + 1] = 255;
        varied[i + 2] = 255;
      }
    }
    const hashA = differenceHash(toLuma(base, width, height), width, height);
    const hashB = differenceHash(toLuma(varied, width, height), width, height);
    const distance = hammingDistance(hashA, hashB);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(20);
  });

  it('gives a large distance for visually opposite images', () => {
    const width = 20;
    const height = 20;
    // A flat image has no left/right gradients at all, so every dHash
    // bit is 0. A monotonic left-to-right gradient is the opposite case:
    // every sampled column is brighter than the one before it, so every
    // comparison reads true regardless of downsampling stride — unlike a
    // checkerboard, a monotonic gradient can't alias into a
    // coincidentally-matching pattern.
    const solid = toLuma(solidRgba(width, height, 128, 128, 128), width, height);
    const gradient = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        gradient[y * width + x] = (x / (width - 1)) * 255;
      }
    }
    const hashSolid = differenceHash(solid, width, height);
    const hashGradient = differenceHash(gradient, width, height);
    expect(hammingDistance(hashSolid, hashGradient)).toBeGreaterThan(20);
  });
});

describe('analyzeImages cache eviction', () => {
  it('evicts the least-recently-seen entries once the cache exceeds MAX_CACHE_ENTRIES', async () => {
    const CACHE_KEY = '@swipix/imageAnalysisCache';
    const total = MAX_CACHE_ENTRIES + 10;
    const seeded: Record<string, { analysis: unknown; lastSeenAt: number }> = {};
    for (let i = 0; i < total; i++) {
      seeded[`id-${i}`] = {
        analysis: { brightness: 100, blurScore: 0, dHash: '0'.repeat(16) },
        lastSeenAt: i, // ascending — id-0 is oldest
      };
    }
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(seeded));

    // No assets passed — eviction runs purely off cache size, independent
    // of any hits/misses in this call.
    const result = await analyzeImages([] as Asset[]);

    expect(result.size).toBe(MAX_CACHE_ENTRIES);
    expect(result.has('id-0')).toBe(false);
    expect(result.has('id-9')).toBe(false);
    expect(result.has(`id-${total - 1}`)).toBe(true);

    const persistedRaw = await AsyncStorage.getItem(CACHE_KEY);
    expect(Object.keys(JSON.parse(persistedRaw as string)).length).toBe(MAX_CACHE_ENTRIES);
  });
});

describe('popcount32', () => {
  it('counts zero bits for 0', () => {
    expect(popcount32(0)).toBe(0);
  });

  it('counts all 32 bits for 0xFFFFFFFF', () => {
    expect(popcount32(0xffffffff)).toBe(32);
  });

  it('counts a single bit', () => {
    expect(popcount32(0b1)).toBe(1);
    expect(popcount32(0b100000)).toBe(1);
  });

  it('counts a known mixed pattern', () => {
    expect(popcount32(0b1011)).toBe(3);
  });
});
