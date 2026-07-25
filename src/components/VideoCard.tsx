import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, PanResponder, LayoutChangeEvent, Pressable, GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useEvent } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Asset } from '../types';

interface VideoCardProps {
  asset: Asset;
  /** Only the top card in the deck should actually play — the two cards
   * stacked behind it stay paused, so at most one video (and one audio
   * stream) plays at a time no matter how many are mounted. */
  isTop: boolean;
}

const SCRUB_TRACK_HEIGHT = 24;
const SCRUB_THUMB_SIZE = 12;

// Confirmed on a real device: a video the OS won't grant read access to
// (FIGSANDBOX "deny file-issue-extension", e.g. a WhatsApp-saved .MP4 —
// same underlying failure VideoThumbnailService now bounds too) can sit
// in the player's 'loading' status forever, retrying the same denied read
// in the background indefinitely — with no fallback UI here, that reads
// as the whole app being stuck, not "this one video won't play." Bounds
// how long an unresolved status is tolerated before treating it the same
// as an explicit 'error'.
const LOAD_TIMEOUT_MS = 8000;

/**
 * A real playing preview instead of a static "Video" placeholder — you
 * can actually see what's in a short clip, and drag the bar at the
 * bottom to scrub through it, before deciding. Muted and looping by
 * default (a swipe session is quick browsing, not a place to be
 * startled by audio); tap the speaker to unmute.
 *
 * Position is tracked from the raw touch's locationX within the track
 * (not gesture.dx deltas like RangeSlider) — there's only one thumb here
 * and no ambiguity about which one is being dragged, so an absolute
 * touch-to-fraction mapping is simpler and just as reliable.
 */
function VideoCard({ asset, isTop }: VideoCardProps) {
  const { t } = useTranslation();
  const [muted, setMuted] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubFraction, setScrubFraction] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const wasPlayingRef = useRef(false);
  const duration = asset.duration || 0;

  const player = useVideoPlayer(asset.uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.timeUpdateEventInterval = 0.25;
  });

  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });

  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const [timedOut, setTimedOut] = useState(false);
  // Belt-and-suspenders alongside the 'error' check below: a genuinely
  // broken/sandboxed file may never emit 'error' at all, just stay
  // 'loading' forever (see LOAD_TIMEOUT_MS above) — this is what actually
  // catches that case, since waiting on 'error' alone would never fire.
  useEffect(() => {
    if (status === 'readyToPlay' || status === 'error') return;
    const timeoutId = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeoutId);
  }, [status]);
  const failed = status === 'error' || timedOut;

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    if (isTop && !failed) {
      player.play();
    } else {
      // Stops retrying a file that's confirmed (or timed out) broken —
      // without this, the player keeps hammering the same denied native
      // read in the background even after the fallback UI is showing.
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
    // Honest confidence signaling: a video that will never play reads as
    // a frozen/broken app if it just sits there blank — say plainly that
    // it couldn't load instead, matching PhotoCard's icon-fallback
    // philosophy for a preview that never resolved.
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
      <Pressable style={styles.muteButton} onPress={() => setMuted((m) => !m)} hitSlop={10}>
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color="#ffffff" />
      </Pressable>
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
