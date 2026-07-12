import React, { useMemo } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Asset } from '../types';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';

interface PhotoCardProps {
  asset: Asset;
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
 * Videos get a placeholder rather than a real thumbnail/player for now —
 * that's a separate feature (frame extraction or expo-video) worth its
 * own scope, not something to bolt on here.
 */
export default function PhotoCard({ asset }: PhotoCardProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (asset.mediaType === 'video') {
    return (
      <View style={[styles.card, styles.videoPlaceholder]}>
        <Ionicons name="videocam" size={48} color={colors.textSecondary} />
        <Text style={styles.videoLabel}>Video</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Image source={{ uri: asset.uri }} style={styles.image} resizeMode="cover" />
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
    videoPlaceholder: { justifyContent: 'center', alignItems: 'center', gap: 8 },
    videoLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  });
}
