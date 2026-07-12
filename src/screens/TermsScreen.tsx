import React, { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import TermsContent from '../components/TermsContent';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';

export default function TermsScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TermsContent />
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 40 },
  });
}
