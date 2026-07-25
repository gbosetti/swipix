import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Asset } from '../types';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';
import VideoCard from './VideoCard';

// Confirmed on a real device: a photo the OS won't grant read access to
// (the same FIGSANDBOX "deny file-issue-extension" failure already bounded
// in VideoThumbnailService/VideoCard) doesn't always surface as an
// expo-image `onError` — it can just sit there never loading and never
// erroring, which means onError alone can leave a card permanently black
// with no signal at all. This timeout is the real backstop: if the image
// hasn't loaded by then, treat it exactly like an explicit load error.
const LOAD_TIMEOUT_MS = 8000;

interface PhotoCardProps {
  asset: Asset;
  /** Whether this card is the top (interactive) one in the deck — passed
   * through to VideoCard so only the top card's video actually plays. */
  isTop?: boolean;
  /** Fired if the photo itself fails to load (e.g. the OS denies access
   * to the underlying file — confirmed on a real device under native
   * resource contention). Never swipeable on a photo the user can't
   * actually see: showing a broken image and still letting left/right
   * decide would mean deleting or keeping something blind. The caller is
   * expected to silently drop this asset from the deck instead — no
   * error UI here, nothing shown at all. */
  onLoadError?: () => void;
}

/**
 * Deliberately "dumb": takes an asset, renders it. No swipe logic,
 * no trash logic. This separation means you can preview/test the visual
 * design of a card in isolation without wiring up gestures or storage.
 *
 * iPhone-styling notes (the aesthetic-usability effect — a beautiful
 * interface is *perceived* as easier to use, which measurably reduces
 * user frustration even when functionality is identical):
 *  - Large corner radius (24) matches iOS 18+ card conventions
 *  - Soft shadow, not a hard border — cards should feel like physical objects
 *  - Full-bleed image so the photo IS the interface, chrome stays minimal
 *
 * Wrapped in React.memo — SwipeDeck re-renders on every swipe/drag/page
 * append, but the 2-3 stacked Asset objects it passes down keep their own
 * identity across those re-renders, so this only actually re-renders when
 * its own asset/isTop genuinely change.
 */
function PhotoCard({ asset, isTop = true, onLoadError }: PhotoCardProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Latest-ref, not a dependency-array entry: onLoadError is a fresh
  // closure every render (SwipeScreen's renderCard recreates it), and
  // this effect should only reset its timer when the ASSET actually
  // changes — not on every unrelated re-render from a sibling card's
  // swipe. Same pattern SwipeDeck already uses for the same reason.
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
          // Background cards never mount a real player — expo-video's
          // useVideoPlayer decodes/buffers as soon as it's created, so 2
          // extra players sitting behind the interactive one would waste
          // memory/battery for something the user can't see or hear yet.
          // Swapped for the real VideoCard automatically once this card
          // becomes top (SwipeDeck re-renders with a new isTop each swipe).
          <View style={[styles.image, styles.videoPlaceholder]}>
            <Ionicons name="videocam" size={28} color={colors.textSecondary} />
          </View>
        )
      ) : (
        // expo-image, not React Native's own <Image> — asset.uri from the
        // live-browsing fetch path is often a raw ph:// Photos-library
        // reference now (PhotoLibraryService skips resolving a real file
        // path up front for speed); expo-image ships a native loader that
        // renders ph:// directly, decoding lazily off the main thread.
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
