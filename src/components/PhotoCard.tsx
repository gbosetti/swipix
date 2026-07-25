import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
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
  /** Fired if the photo fails to load. Never swipeable on a photo the
   * user can't see — the caller is expected to silently drop this asset
   * from the deck. No error UI here. */
  onLoadError?: () => void;
}

/**
 * Deliberately "dumb": renders an asset, no swipe/trash logic.
 *
 * @remarks
 * Wrapped in React.memo — SwipeDeck re-renders often, but the stacked
 * Asset objects keep their own identity, so this only re-renders when its
 * own asset/isTop genuinely change.
 */
function PhotoCard({ asset, isTop = true, onLoadError }: PhotoCardProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Latest-ref: onLoadError is a fresh closure every render, but this
  // effect should only reset its timer when the asset itself changes.
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;
  const settledRef = useRef(false);

  useEffect(() => {
    if (asset.mediaType === 'video') return;
    settledRef.current = false;
    const timeoutId = setTimeout(() => {
      if (settledRef.current) return;
      settledRef.current = true;
      onLoadErrorRef.current?.();
    }, LOAD_TIMEOUT_MS);
    return () => {
      settledRef.current = true;
      clearTimeout(timeoutId);
    };
  }, [asset.id, asset.mediaType]);

  const handleLoaded = () => {
    settledRef.current = true;
  };

  const handleError = () => {
    settledRef.current = true;
    onLoadErrorRef.current?.();
  };

  return (
    <View style={styles.card}>
      {asset.mediaType === 'video' ? (
        isTop ? (
          <VideoCard asset={asset} isTop={isTop} />
        ) : (
          // Background cards never mount a real player — useVideoPlayer
          // decodes/buffers immediately, wasting memory for what's unseen.
          <View style={[styles.image, styles.videoPlaceholder]}>
            <Ionicons name="videocam" size={28} color={colors.textSecondary} />
          </View>
        )
      ) : (
        // expo-image, not core <Image> — it renders a raw ph:// reference
        // directly, decoding lazily off the main thread.
        <Image
          source={{ uri: asset.uri }}
          style={styles.image}
          contentFit="cover"
          onLoad={handleLoaded}
          onError={handleError}
        />
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
  });
}
