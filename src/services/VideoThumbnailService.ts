import { createVideoPlayer, VideoPlayer, VideoThumbnail } from 'expo-video';

// A video the OS won't hand over can leave the player stuck in 'loading'
// forever, retrying indefinitely — without a bound, player.release()
// never runs either, and the retries keep competing for native resources
// elsewhere in the app. Bounds the whole extraction (ready-wait AND frame
// generation), not just one stage.
const EXTRACTION_TIMEOUT_MS = 5000;

// Some videos fail this same way on every app launch (a persistent OS
// denial, not a one-off blip), and previews get re-requested on every
// mount/focus/selection change — without this, each retry pays the full
// timeout again, competing for resources with whatever else is happening.
// Session-lifetime only: a transient failure gets a fresh chance next launch.
const knownFailedUris = new Set<string>();

/**
 * Each extraction opens a real native video player (file handle, decode
 * buffers) — TrashScreen/KeptScreen request one for every video in the
 * list at once with no batching of their own, so a large trash/kept list
 * (e.g. after a long deletion session) could otherwise spin up dozens of
 * concurrent native players simultaneously. Confirmed as a real crash on
 * a physical device: the app was killed outright with no error, no JS
 * exception for the app's own ErrorBoundary to catch — consistent with
 * an OS-level out-of-memory termination, which gives the app no chance
 * to react. Kept low (heavier per-item cost than a plain asset-info
 * call) and lives here, not per-caller, so every current and future
 * caller is protected the same way.
 */
const THUMBNAIL_CONCURRENCY = 3;
let activeExtractions = 0;
const pendingExtractions: (() => void)[] = [];

function acquireExtractionSlot(): Promise<void> {
  if (activeExtractions < THUMBNAIL_CONCURRENCY) {
    activeExtractions++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    pendingExtractions.push(() => {
      activeExtractions++;
      resolve();
    });
  });
}

function releaseExtractionSlot(): void {
  activeExtractions--;
  const next = pendingExtractions.shift();
  if (next) {
    next();
  }
}

/**
 * Extracts a single representative frame from a video file, for a static
 * preview where playing the video would be overkill.
 *
 * @returns A native image reference (not a URI, only expo-image's
 * `<Image>` can render it), or `null` on any failure/timeout.
 */
export async function getVideoThumbnail(uri: string): Promise<VideoThumbnail | null> {
  if (knownFailedUris.has(uri)) {
    return null;
  }
  await acquireExtractionSlot();
  try {
    const player = createVideoPlayer(uri);
    try {
      return await withTimeout(extractThumbnail(player), EXTRACTION_TIMEOUT_MS);
    } catch {
      knownFailedUris.add(uri);
      return null;
    } finally {
      player.release();
    }
  } finally {
    releaseExtractionSlot();
  }
}

async function extractThumbnail(player: VideoPlayer): Promise<VideoThumbnail | null> {
  await waitUntilReady(player);
  const [thumbnail] = await player.generateThumbnailsAsync([0]);
  return thumbnail ?? null;
}

// Manual settled-flag + clearTimeout, not a bare Promise.race — a race
// never cancels the losing side's timer, leaving a live timer running
// past every successful extraction (see CategoryStrategy.getPreview).
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error('Video thumbnail extraction timed out'));
    }, ms);
    promise.then(
      (value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

/**
 * generateThumbnailsAsync needs the asset's metadata loaded first —
 * without this, it's called against a player that hasn't opened the
 * file yet and just fails.
 */
function waitUntilReady(player: VideoPlayer): Promise<void> {
  return new Promise((resolve, reject) => {
    if (player.status === 'readyToPlay') {
      resolve();
      return;
    }
    if (player.status === 'error') {
      reject(new Error('Video failed to load'));
      return;
    }
    const subscription = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'readyToPlay') {
        subscription.remove();
        resolve();
      } else if (status === 'error') {
        subscription.remove();
        reject(error ?? new Error('Video failed to load'));
      }
    });
  });
}
