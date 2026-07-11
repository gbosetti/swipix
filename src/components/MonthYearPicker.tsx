import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

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
          color={atMin ? Colors.trackInactive : Colors.textPrimary}
        />
      </Pressable>
      <Text style={styles.label}>
        {MONTH_NAMES[month]} {year}
      </Text>
      <Pressable onPress={() => step(1)} disabled={atMax} hitSlop={8} style={styles.arrow}>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={atMax ? Colors.trackInactive : Colors.textPrimary}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  arrow: { padding: 4 },
  label: { color: Colors.textPrimary, fontSize: 16, fontWeight: '600', minWidth: 150, textAlign: 'center' },
});
