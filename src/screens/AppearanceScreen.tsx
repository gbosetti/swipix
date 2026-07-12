import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { ColorPalette } from '../theme/colors';
import type { ThemeMode } from '../theme/ThemeContext';

const MODES: ThemeMode[] = ['system', 'light', 'dark'];

/**
 * Runtime light/dark switch, reachable from Settings. Picking a mode
 * here updates every currently-mounted screen immediately (no restart)
 * and persists the choice, same pattern as LanguageScreen.
 */
export default function AppearanceScreen() {
  const { t } = useTranslation();
  const { mode, colors, setMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.screen}>
      {MODES.map((option) => {
        const selected = mode === option;
        return (
          <Pressable key={option} style={styles.row} onPress={() => setMode(option)}>
            <Text style={styles.rowText}>{t(`appearance.${option}`)}</Text>
            {selected && <Ionicons name="checkmark" size={20} color={colors.accent} />}
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background, padding: 20, gap: 10 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.card,
      borderRadius: 14,
      paddingVertical: 16,
      paddingHorizontal: 18,
    },
    rowText: { color: colors.textPrimary, fontSize: 16 },
  });
}
