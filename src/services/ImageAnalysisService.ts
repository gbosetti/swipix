/**
 * Isolated image-analysis helpers. Kept separate from strategies so
 * strategies stay declarative ("what counts as a match") while this file
 * stays the only place doing actual pixel work.
 */

/**
 * Placeholder brightness calculation. For a real implementation you'd use
 * something like `react-native-image-brightness` or run a tiny canvas-based
 * sample via `expo-gl`. Stubbed here so the app runs end-to-end immediately;
 * swap this function's internals without touching any strategy.
 */
export async function getAverageBrightness(uri: string): Promise<number> {
  // TODO: replace with real pixel sampling
  return Math.random() * 255;
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
  return Math.random() * 100;
}
