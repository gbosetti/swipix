import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { StorageService, StorageInfo } from '../services/StorageService';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';

const LOW_SPACE_THRESHOLD_BYTES = 2 * 1024 * 1024 * 1024; /** 2 GB */

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Answers "do I even need to clean up?" before the user commits to
 * swiping through anything — refreshes on focus so emptying trash (which
 * actually frees real device storage) is reflected right away.
 */
export default function StorageMeter() {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [info, setInfo] = useState<StorageInfo | null>(null);

  useFocusEffect(
    useCallback(() => {
      StorageService.getStorageInfo().then(setInfo);
    }, [])
  );

  if (!info) {
    return null;
  }

  const usedBytes = info.totalBytes - info.freeBytes;
  const usedFraction = info.totalBytes > 0 ? usedBytes / info.totalBytes : 0;
  const isLow = info.freeBytes < LOW_SPACE_THRESHOLD_BYTES;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{t('categoryPicker.storageLabel')}</Text>
        <Text style={[styles.freeText, isLow && styles.freeTextLow]}>
          {t('categoryPicker.storageFree', { amount: formatBytes(info.freeBytes) })}
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${Math.min(usedFraction * 100, 100)}%` },
            isLow && styles.fillLow,
          ]}
        />
      </View>
      <Text style={styles.totalText}>
        {t('categoryPicker.storageUsed', {
          used: formatBytes(usedBytes),
          total: formatBytes(info.totalBytes),
        })}
      </Text>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 16,
      gap: 8,
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    label: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
    freeText: { color: colors.textSecondary, fontSize: 13 },
    freeTextLow: { color: colors.danger, fontWeight: '600' },
    track: { height: 8, borderRadius: 4, backgroundColor: colors.trackInactive, overflow: 'hidden' },
    fill: { height: '100%', backgroundColor: colors.accent, borderRadius: 4 },
    fillLow: { backgroundColor: colors.danger },
    totalText: { color: colors.textSecondary, fontSize: 12 },
  });
}
