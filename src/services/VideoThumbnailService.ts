import { createVideoPlayer, VideoPlayer, VideoThumbnail } from 'expo-video';

/**
 * Extracts a single representative frame from a video file, for use as a
 * static preview (category cards, Trash/Kept list rows) where actually
 * playing the video would be overkill — that's what VideoCard is for.
 *
 * The returned VideoThumbnail is a native image reference, not a URI —
 * it can only be rendered via expo-image's <Image>, not React Native's
 * core <Image>. Swallows all failures (corrupt file, unsupported codec)
 * and returns null instead: a missing thumbnail should fall back to a
 * generic icon, not break the screen.
 */
export async function getVideoThumbnail(uri: string): Promise<VideoThumbnail | null> {
  const player = createVideoPlayer(uri);
  try {
    await waitUntilReady(player);
    const [thumbnail] = await player.generateThumbnailsAsync([0]);
    return thumbnail ?? null;
  } catch {
    return null;
  } finally {
    player.release();
  }
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
