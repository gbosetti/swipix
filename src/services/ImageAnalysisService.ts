/**
 * Isolated image-analysis helpers. Kept separate from strategies so
 * strategies stay declarative ("what counts as a match") while this file
 * stays the only place doing actual pixel work.
 */

/**
 * Deterministic pseudo-score derived from a string, in [0, 1). Backs the
 * two stubs below: unlike Math.random(), the same uri always produces
 * the same score, so a given photo's category membership (and any
 * preview thumbnail built from it) stays stable across repeated calls
 * instead of reshuffling every time match() runs.
 *
 * FNV-1a, not a simpler polynomial hash (hash*31 + charCode): real photo
 * filenames are near-identical except for a few trailing digits (e.g.
 * IMG_0001 vs IMG_0002), and a polynomial hash gives the last character
 * almost no weight, so two different photos would get almost the same
 * score. FNV-1a remixes the entire accumulated hash through a multiply
 * after every character, including the last, so it doesn't have that
 * blind spot.
 */
function hashToUnitInterval(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0xffffffff;
}

/**
 * Placeholder brightness calculation. For a real implementation you'd use
 * something like `react-native-image-brightness` or run a tiny canvas-based
 * sample via `expo-gl`. Stubbed here so the app runs end-to-end immediately;
 * swap this function's internals without touching any strategy.
 */
export async function getAverageBrightness(uri: string): Promise<number> {
  // TODO: replace with real pixel sampling
  return hashToUnitInterval(`brightness:${uri}`) * 255;
}

/**
 * Placeholder blur score, 0 (sharp) to 100 (very blurry). A real
 * implementation needs edge-detection on pixel data (e.g. Laplacian
 * variance) — there's no metadata shortcut for this one, unlike
 * screenshots. Stubbed here so BlurredImagesStrategy runs end-to-end;
 * swap this function's internals without touching the strategy.
 */
export async function getBlurScore(uri: string): Promise<number> {
  // TODO: replace with real edge-detection analysis
  return hashToUnitInterval(`blur:${uri}`) * 100;
}
