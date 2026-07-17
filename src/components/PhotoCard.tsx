import React, { useMemo } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Asset } from '../types';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';
import VideoCard from './VideoCard';

interface PhotoCardProps {
  asset: Asset;
  /** Whether this card is the top (interactive) one in the deck — passed
   * through to VideoCard so only the top card's video actually plays. */
  isTop?: boolean;
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
 */
export default function PhotoCard({ asset, isTop = true }: PhotoCardProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.card}>
      {asset.mediaType === 'video' ? (
        <VideoCard asset={asset} isTop={isTop} />
      ) : (
        <Image source={{ uri: asset.uri }} style={styles.image} resizeMode="cover" />
      )}
    </View>
  );
}

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
  });
}
