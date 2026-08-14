import React from 'react';
import { Modal, View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useColors } from '../theme/ThemeContext';

type Props = {
  visible: boolean;
  label: string;
};

/**
 * Full-screen state shown only after `showInterstitialAd` resolves
 * `false` (no fill, load error, timeout) — without it, that response can
 * arrive fast enough that the delete/reset it gates happens so abruptly
 * it reads as if the ad step never ran at all.
 */
export default function AdUnavailableOverlay({ visible, label }: Props) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[styles.overlay, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  label: { fontSize: 16, fontWeight: '600' },
});
