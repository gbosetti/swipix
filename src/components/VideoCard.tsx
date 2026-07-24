import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, PanResponder, LayoutChangeEvent, Pressable, GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    if (isTop) {
      player.play();
    } else {
      player.pause();
    }
  }, [isTop, player]);

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
