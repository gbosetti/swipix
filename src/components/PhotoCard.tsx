import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Asset } from '../types';

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
 */
export default function PhotoCard({ asset }: PhotoCardProps) {
  return (
    <View style={styles.card}>
      <Image source={{ uri: asset.uri }} style={styles.image} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#111',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  image: { width: '100%', height: '100%' },
});
