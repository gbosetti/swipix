import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Asset } from '../types';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';
import VideoCard from './VideoCard';

// A photo the OS won't grant read access to doesn't always surface as an
// expo-image `onError` — it can just sit there never loading. This timeout
// is the real backstop: treat a never-loaded image the same as an error.
const LOAD_TIMEOUT_MS = 8000;

interface PhotoCardProps {
  asset: Asset;
  /** True only for the frontmost, interactive card. */
  isTop?: boolean;
  /**
   * Fired if the asset (photo or video) fails to load. Never swipeable
   * on something the user can't see — the caller is expected to silently
   * drop this asset from the deck.
   */
  onLoadError?: () => void;
  /**
   * Opens the OS share sheet for this asset. Awaited only to drive the
   * button's own brief loading spinner — sharing is never a swipe
   * decision, so this never advances or otherwise touches the deck.
   */
  onShare?: (asset: Asset) => Promise<void>;
  /**
   * Whether the screen showing this card currently has navigation focus.
   * `isTop` alone can't tell a playing video to stop making sound —
   * bottom-tab siblings stay mounted (just unfocused) when the user
   * switches tabs, so a card can still be "the top card of its own deck"
   * long after the whole screen isn't visible anymore. Defaults to true
   * so a caller that doesn't track focus doesn't need to pass it.
   */
  screenFocused?: boolean;
}

/**
 * Deliberately "dumb": renders an asset, no swipe/trash logic.
 *
 * @remarks
 * Wrapped in React.memo — SwipeDeck re-renders often, but the stacked
 * Asset objects keep their own identity, so this only re-renders when its
 * own asset/isTop genuinely change.
 */
function PhotoCard({ asset, isTop = true, onLoadError, onShare, screenFocused = true }: PhotoCardProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [sharing, setSharing] = useState(false);
  const [loading, setLoading] = useState(asset.mediaType !== 'video');
  // Bumping this remounts the <Image> below (via its `key`), forcing a
  // genuinely fresh load attempt rather than reusing whatever internal
  // state expo-image was stuck in.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(asset.mediaType !== 'video');
  }, [asset.id, asset.mediaType]);

  const handleShare = async () => {
    if (sharing || !onShare) {
      return;
    }
    setSharing(true);
    try {
      await onShare(asset);
    } finally {
      setSharing(false);
    }
  };

  // Latest-ref: onLoadError is a fresh closure every render, but this
  // effect should only reset its timer when the asset itself changes.
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;
  const settledRef = useRef(false);

  useEffect(() => {
    if (asset.mediaType === 'video') {
      return;
    }
    settledRef.current = false;
    const timeoutId = setTimeout(() => {
      if (settledRef.current) {
        return;
      }
      settledRef.current = true;
      onLoadErrorRef.current?.();
    }, LOAD_TIMEOUT_MS);
    return () => {
      settledRef.current = true;
      clearTimeout(timeoutId);
    };
  }, [asset.id, asset.mediaType, reloadKey]);

  const handleLoaded = () => {
    settledRef.current = true;
    setLoading(false);
  };

  const handleError = () => {
    settledRef.current = true;
    onLoadErrorRef.current?.();
  };

  // Lets the user force a fresh attempt on a slow/stuck load (e.g. an
  // iCloud-only photo still downloading) instead of waiting out the full
  // LOAD_TIMEOUT_MS backstop.
  const handleRetry = () => {
    settledRef.current = false;
    setLoading(true);
    setReloadKey((key) => key + 1);
  };

  return (
    <View style={styles.card}>
      {asset.mediaType === 'video' ? (
        isTop ? (
          <VideoCard
            asset={asset}
            isTop={isTop}
            onLoadError={onLoadError}
            screenFocused={screenFocused}
          />
        ) : (
          // Background cards never mount a real player — useVideoPlayer
          // decodes/buffers immediately, wasting memory for what's unseen.
          <View style={[styles.image, styles.videoPlaceholder]}>
            <Ionicons name="videocam" size={28} color={colors.textSecondary} />
          </View>
        )
      ) : (
        // expo-image, not core <Image> — it renders a raw ph:// reference
        // directly, decoding lazily off the main thread. cachePolicy=none
        // and recyclingKey: a swipe-deck card is shown once and decided,
        // never revisited this session — confirmed via a real Sentry
        // report (RAM-overuse watchdog kill after ~100 swipes) that
        // caching full-resolution decodes here was pure overhead.
        <Image
          key={reloadKey}
          source={{ uri: asset.uri }}
          style={styles.image}
          contentFit="cover"
          cachePolicy="none"
          recyclingKey={asset.id}
          onLoad={handleLoaded}
          onError={handleError}
        />
      )}
      {isTop && asset.mediaType === 'photo' && loading && (
        <Pressable testID="photo-retry-button" style={styles.retryButton} onPress={handleRetry} hitSlop={10}>
          <ActivityIndicator size="small" color="#ffffff" />
        </Pressable>
      )}
      {isTop && onShare && (
        <Pressable
          testID="photo-share-button"
          style={styles.shareButton}
          onPress={handleShare}
          disabled={sharing}
          hitSlop={10}
        >
          {sharing ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Ionicons name="share-outline" size={18} color="#ffffff" />
          )}
        </Pressable>
      )}
    </View>
  );
}

export default React.memo(PhotoCard);

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      flex: 1,
      borderRadius: 24,
      overflow: 'hidden',
      backgroundColor: colors.cardDark,
      shadowColor: colors.background,
      shadowOpacity: 0.25,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    image: { width: '100%', height: '100%' },
    videoPlaceholder: {
      backgroundColor: colors.cardDark,
      justifyContent: 'center',
      alignItems: 'center',
    },
    // Mirrors VideoCard's mute button, opposite corner — same treatment
    // for a photo or a video, so it doesn't collide with the mute button
    // VideoCard already renders on its own top-right.
    shareButton: {
      position: 'absolute',
      top: 12,
      left: 12,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    // Centered, not corner-anchored like shareButton — this is a "this
    // needs your attention" affordance, not a persistent action button.
    retryButton: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      marginTop: -20,
      marginLeft: -20,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
}
