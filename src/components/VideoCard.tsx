import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, StyleSheet, PanResponder, LayoutChangeEvent, Pressable, GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useEvent } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Asset } from '../types';

// A new VideoCard instance mounts for every card (SwipeDeck keys by asset
// id), so plain component state would reset the mute choice on every
// single video — confirmed annoying on a real device: unmuting one video
// only to have the very next one silently muted again. Module-level, not
// per-card state, so the choice carries across the whole session — every
// mounted (and future) VideoCard reads and writes the same preference.
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
  /** Only the top card actually plays — the stacked cards behind it stay
   * paused. */
  isTop: boolean;
  /** Fired once if the video fails to load. Mirrors PhotoCard's
   * onLoadError — never swipeable on a video the user can't actually see;
   * the caller is expected to silently drop this asset from the deck. */
  onLoadError?: () => void;
}

const SCRUB_TRACK_HEIGHT = 24;
const SCRUB_THUMB_SIZE = 12;

// A video the OS won't grant read access to can sit in 'loading' forever,
// retrying the denied read indefinitely. Bounds how long an unresolved
// status is tolerated before treating it as an explicit 'error'.
const LOAD_TIMEOUT_MS = 8000;

/**
 * A real playing preview, muted and looping by default, with a scrub bar.
 *
 * @remarks
 * Scrub position tracks the raw touch's locationX within the track, not
 * gesture.dx deltas — only one thumb, so an absolute mapping is simpler.
 */
function VideoCard({ asset, isTop, onLoadError }: VideoCardProps) {
  const { t } = useTranslation();
  const [muted, setMuted] = useMutedPreference();
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubFraction, setScrubFraction] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const wasPlayingRef = useRef(false);
  const duration = asset.duration || 0;

  const player = useVideoPlayer(asset.uri, (p) => {
    p.loop = true;
    // The current shared preference, not a hardcoded true — avoids a
    // flash of audio before the effect below has a chance to sync it.
    p.muted = mutedPreference;
    p.timeUpdateEventInterval = 0.25;
  });

  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });

  const { status } = useEvent(player, 'statusChange', { status: player.status });
  // Backgrounding the app, or handing off to the share sheet, can pause
  // playback without ever changing `isTop`/`failed` — the effect below
  // has no reason to fire again, so nothing resumes it automatically.
  // Confirmed on a real device: returning from Share left the video
  // stuck paused with no way to resume short of swiping away and back.
  // Tracked reactively (not just read once) so the resume button shows
  // up the moment that happens, not just after some other re-render.
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const [timedOut, setTimedOut] = useState(false);
  // A broken/sandboxed file may never emit 'error', just stay 'loading' —
  // the timeout is what actually catches that case.
  useEffect(() => {
    if (status === 'readyToPlay' || status === 'error') return;
    const timeoutId = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeoutId);
  }, [status]);
  const failed = status === 'error' || timedOut;

  // Never swipeable on a video the user can't see — a left/right decision
  // would trash or keep something never actually watched. Latest-ref for
  // onLoadError, same pattern as PhotoCard: it's a fresh closure every
  // render, but this should only fire once per asset, not on every render
  // where it happens to be a new function.
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
    if (isTop && !failed) {
      player.play();
    } else {
      // Stops retrying a confirmed-broken file in the background.
      player.pause();
    }
  }, [isTop, player, failed]);

  const progressFraction = scrubbing
    ? scrubFraction
    : duration > 0
      ? Math.min(1, Math.max(0, currentTime / duration))
      : 0;

  const seekToLocationX = (x: number) => {
    if (trackWidthRef.current <= 0 || duration <= 0) return;
    const fraction = Math.min(1, Math.max(0, x / trackWidthRef.current));
    setScrubFraction(fraction);
    player.currentTime = fraction * duration;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        wasPlayingRef.current = player.playing;
        player.pause();
        setScrubbing(true);
        seekToLocationX(e.nativeEvent.locationX);
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        seekToLocationX(e.nativeEvent.locationX);
      },
      onPanResponderRelease: () => {
        setScrubbing(false);
        if (wasPlayingRef.current) player.play();
      },
    })
  ).current;

  const handleTrackLayout = (e: LayoutChangeEvent) => {
    trackWidthRef.current = e.nativeEvent.layout.width;
    setTrackWidth(e.nativeEvent.layout.width);
  };

  if (failed) {
    // Say plainly that it couldn't load, rather than sitting blank.
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
      />
      <Pressable
        testID="video-mute-button"
        style={styles.muteButton}
        onPress={() => setMuted(!muted)}
        hitSlop={10}
      >
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color="#ffffff" />
      </Pressable>
      {!isPlaying && !scrubbing && (
        <Pressable testID="video-play-button" style={styles.playButton} onPress={() => player.play()} hitSlop={10}>
          <Ionicons name="play" size={28} color="#ffffff" />
        </Pressable>
      )}
      <View style={styles.scrubArea} onLayout={handleTrackLayout} {...panResponder.panHandlers}>
        <View style={styles.scrubTrack}>
          <View style={[styles.scrubFill, { width: `${progressFraction * 100}%` }]} />
        </View>
        <View
          style={[
            styles.scrubThumb,
            { left: progressFraction * trackWidth - SCRUB_THUMB_SIZE / 2 },
          ]}
        />
      </View>
    </View>
  );
}

export default React.memo(VideoCard);

// Exported for tests only, to reset the shared preference between cases —
// not part of VideoCard's own consumer-facing API.
export { setMutedPreference };

const styles = StyleSheet.create({
  container: { flex: 1 },
  video: { flex: 1 },
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
    marginLeft: -26, // optically centered — a play glyph's own visual
    // weight leans right, so a couple px less on the left reads centered.
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrubArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SCRUB_TRACK_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  scrubTrack: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  scrubFill: { height: 3, backgroundColor: '#ffffff' },
  scrubThumb: {
    position: 'absolute',
    width: SCRUB_THUMB_SIZE,
    height: SCRUB_THUMB_SIZE,
    borderRadius: SCRUB_THUMB_SIZE / 2,
    backgroundColor: '#ffffff',
    top: (SCRUB_TRACK_HEIGHT - SCRUB_THUMB_SIZE) / 2,
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
