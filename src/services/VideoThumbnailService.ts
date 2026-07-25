import { createVideoPlayer, VideoPlayer, VideoThumbnail } from 'expo-video';

// A video whose file the OS won't hand over (confirmed on a real device:
// FIGSANDBOX "deny file-issue-extension" against a WhatsApp-saved .MP4)
// can leave the player stuck in 'loading' forever, retrying the same
// denied read — without a bound, `extractThumbnail` below never settles,
// so `player.release()` (in getVideoThumbnail's `finally`) never runs
// either. The underlying AVPlayer then keeps silently retrying in the
// background for a preview nobody's even looking at anymore, burning real
// native resources that compete with unrelated photo/video loads
// elsewhere in the app. Bounds the whole extraction (ready-wait AND frame
// generation — both are native calls that could hang the same way), not
// just one stage of it.
const EXTRACTION_TIMEOUT_MS = 5000;

/**
 * Extracts a single representative frame from a video file, for use as a
 * static preview (category cards, Trash/Kept list rows) where actually
 * playing the video would be overkill — that's what VideoCard is for.
 *
 * The returned VideoThumbnail is a native image reference, not a URI —
 * it can only be rendered via expo-image's <Image>, not React Native's
 * core <Image>. Swallows all failures (corrupt file, unsupported codec,
 * timeout) and returns null instead: a missing thumbnail should fall back
 * to a generic icon, not break the screen.
 */
export async function getVideoThumbnail(uri: string): Promise<VideoThumbnail | null> {
  const player = createVideoPlayer(uri);
  try {
    return await withTimeout(extractThumbnail(player), EXTRACTION_TIMEOUT_MS);
  } catch {
    return null;
  } finally {
    player.release();
  }
}

async function extractThumbnail(player: VideoPlayer): Promise<VideoThumbnail | null> {
  await waitUntilReady(player);
  const [thumbnail] = await player.generateThumbnailsAsync([0]);
  return thumbnail ?? null;
}

// Manual settled-flag + clearTimeout, not a bare Promise.race — a race
// never cancels the losing side's timer, so every SUCCESSFUL extraction
// would still leave a live 5s setTimeout running for no reason (the exact
// bug CategoryStrategy.getPreview hit and fixed the same way).
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Video thumbnail extraction timed out'));
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

/** generateThumbnailsAsync needs the asset's metadata loaded first —
 * without this, it's called against a player that hasn't opened the
 * file yet and just fails. */
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
