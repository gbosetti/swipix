import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';

const DEFAULT_MIN_YEAR = 2000;

interface MonthYearPickerProps {
  year: number;
  month: number; // 0-11
  onChange: (year: number, month: number) => void;
  minYear?: number;
}

/**
 * A single combined stepper ("‹ March 2026 ›") rather than two independent
 * month/year controls — stepping past January/December naturally rolls
 * the year over, so there's no way to land on an invalid combination.
 * Bounded to [minYear, this month], since a future month or a year before
 * DEFAULT_MIN_YEAR can never contain real photos.
 */
export default function MonthYearPicker({
  year,
  month,
  onChange,
  minYear = DEFAULT_MIN_YEAR,
}: MonthYearPickerProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const now = new Date();
  const maxYear = now.getFullYear();
  const maxMonth = now.getMonth();

  const atMax = year > maxYear || (year === maxYear && month >= maxMonth);
  const atMin = year < minYear || (year === minYear && month <= 0);

  const step = (direction: 1 | -1) => {
    let newMonth = month + direction;
    let newYear = year;
    if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    } else if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    }
    if (newYear > maxYear || (newYear === maxYear && newMonth > maxMonth)) {
      newYear = maxYear;
      newMonth = maxMonth;
    }
    if (newYear < minYear) {
      newYear = minYear;
      newMonth = 0;
    }
    onChange(newYear, newMonth);
  };

  return (
    <View style={styles.row}>
      <Pressable onPress={() => step(-1)} disabled={atMin} hitSlop={8} style={styles.arrow}>
        <Ionicons
          name="chevron-back"
          size={20}
          color={atMin ? colors.trackInactive : colors.textPrimary}
        />
      </Pressable>
      <Text style={styles.label}>
        {t(`months.${month}`)} {year}
      </Text>
      <Pressable onPress={() => step(1)} disabled={atMax} hitSlop={8} style={styles.arrow}>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={atMax ? colors.trackInactive : colors.textPrimary}
        />
      </Pressable>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      marginTop: 12,
      marginBottom: 4,
    },
    arrow: { padding: 4 },
    label: { color: colors.textPrimary, fontSize: 16, fontWeight: '600', minWidth: 150, textAlign: 'center' },
  });
}
