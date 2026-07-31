import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useEvent } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Asset } from '../types';

/**
 * A new VideoCard instance mounts for every card (SwipeDeck keys by asset
 * id), so plain component state would reset the mute choice on every
 * single video — confirmed annoying on a real device: unmuting one video
 * only to have the very next one silently muted again. Module-level, not
 * per-card state, so the choice carries across the whole session — every
 * mounted (and future) VideoCard reads and writes the same preference.
 */
let mutedPreference = true;
const muteListeners = new Set<() => void>();

function setMutedPreference(next: boolean) {
  if (mutedPreference === next) return;
  mutedPreference = next;
  muteListeners.forEach((listener) => listener());
}

function useMutedPreference(): [boolean, (next: boolean) => void] {
  const muted = useSyncExternalStore(
    (onStoreChange) => {
      muteListeners.add(onStoreChange);
      return () => muteListeners.delete(onStoreChange);
    },
    () => mutedPreference
  );
  return [muted, setMutedPreference];
}

interface VideoCardProps {
  asset: Asset;
  /**
   * Only the top card actually plays — the stacked cards behind it stay
   * paused.
   */
  isTop: boolean;
  /**
   * Fired once if the video fails to load. Mirrors PhotoCard's
   * onLoadError — never swipeable on a video the user can't actually see;
   * the caller is expected to silently drop this asset from the deck.
   */
  onLoadError?: () => void;
  /**
   * Whether the screen this card lives on currently has navigation
   * focus. `isTop` alone isn't enough to know whether this should be
   * playing — a bottom-tab sibling screen stays mounted (and its top
   * card stays "the top card") even after the user switches tabs away
   * from it. Confirmed on a real device: without this, switching tabs
   * left a video's audio playing invisibly in the background.
   */
  screenFocused?: boolean;
}

/**
 * A video the OS won't grant read access to can sit in 'loading' forever,
 * retrying the denied read indefinitely. Bounds how long an unresolved
 * status is tolerated before treating it as an explicit 'error'.
 */
const LOAD_TIMEOUT_MS = 8000;

/** A real playing preview, muted and looping by default. */
function VideoCard({ asset, isTop, onLoadError, screenFocused = true }: VideoCardProps) {
  const { t } = useTranslation();
  const [muted, setMuted] = useMutedPreference();

  const player = useVideoPlayer(asset.uri, (p) => {
    p.loop = true;
    /**
     * The current shared preference, not a hardcoded true — avoids a
     * flash of audio before the effect below has a chance to sync it.
     */
    p.muted = mutedPreference;
  });

  const { status } = useEvent(player, 'statusChange', { status: player.status });
  /**
   * Backgrounding the app, or handing off to the share sheet, can pause
   * playback without ever changing `isTop`/`failed` — the effect below
   * has no reason to fire again, so nothing resumes it automatically.
   * Confirmed on a real device: returning from Share left the video
   * stuck paused with no way to resume short of swiping away and back.
   * Tracked reactively (not just read once) so the play/pause button
   * reflects it the moment that happens, not just after some other
   * re-render.
   */
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const [timedOut, setTimedOut] = useState(false);
  /**
   * A broken/sandboxed file may never emit 'error', just stay 'loading' —
   * the timeout is what actually catches that case.
   */
  useEffect(() => {
    if (status === 'readyToPlay' || status === 'error') return;
    const timeoutId = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeoutId);
  }, [status]);
  const failed = status === 'error' || timedOut;

  /**
   * Never swipeable on a video the user can't see — a left/right decision
   * would trash or keep something never actually watched. Latest-ref for
   * onLoadError, same pattern as PhotoCard: it's a fresh closure every
   * render, but this should only fire once per asset, not on every render
   * where it happens to be a new function.
   */
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;
  const settledRef = useRef(false);
  useEffect(() => {
    settledRef.current = false;
  }, [asset.id]);
  useEffect(() => {
    if (!failed || settledRef.current) return;
    settledRef.current = true;
    onLoadErrorRef.current?.();
  }, [failed]);

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    if (isTop && !failed && screenFocused) {
      player.play();
    } else {
      /**
       * Stops retrying a confirmed-broken file in the background, and —
       * via screenFocused — stops it from playing on into a tab the user
       * has already navigated away from.
       */
      player.pause();
    }
  }, [isTop, player, failed, screenFocused]);

  if (failed) {
    /** Say plainly that it couldn't load, rather than sitting blank. */
    return (
      <View style={styles.container}>
        <View style={[styles.video, styles.videoPlaceholder]}>
          <Ionicons name="videocam-off-outline" size={28} color="#ffffff" />
          <Text style={styles.videoUnavailableText}>{t('swipe.videoUnavailable')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
        pointerEvents="none"
        /**
         * expo-video defaults to Android's SurfaceView, which composites
         * as its own hardware layer punched through the normal view
         * hierarchy — confirmed on a real device this doesn't reliably
         * follow SwipeDeck's animated drag transform (translateX/rotate),
         * unlike a real photo card, which is why videos alone couldn't be
         * dragged. TextureView is a regular hardware-accelerated view that
         * participates in the normal rendering pipeline instead.
         */
        surfaceType="textureView"
      />
      {/**
       * Extra safety net: if a native player view ever swallows touches
       * at the native level before SwipeDeck's PanResponder sees them,
       * this plain RN View sitting on top of it participates correctly in
       * RN's touch responder system regardless, letting the touch bubble
       * up to the ancestor swipe gesture normally.
       */}
      <View style={styles.touchInterceptor} />
      <Pressable
        testID="video-mute-button"
        style={styles.muteButton}
        onPress={() => setMuted(!muted)}
        hitSlop={10}
      >
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color="#ffffff" />
      </Pressable>
      <Pressable
        testID="video-play-pause-button"
        style={styles.playButton}
        onPress={() => (isPlaying ? player.pause() : player.play())}
        hitSlop={10}
      >
        <Ionicons name={isPlaying ? 'pause' : 'play'} size={28} color="#ffffff" />
      </Pressable>
    </View>
  );
}

export default React.memo(VideoCard);

/**
 * Exported for tests only, to reset the shared preference between cases —
 * not part of VideoCard's own consumer-facing API.
 */
export { setMutedPreference };

const styles = StyleSheet.create({
  container: { flex: 1 },
  video: { flex: 1 },
  touchInterceptor: { ...StyleSheet.absoluteFillObject },
  videoPlaceholder: {
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  videoUnavailableText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.8,
  },
  muteButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -28,
    /**
     * Optically centered — a play glyph's own visual weight leans right,
     * so a couple px less on the left reads centered.
     */
    marginLeft: -26,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
