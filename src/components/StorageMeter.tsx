import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { StorageService, StorageInfo } from '../services/StorageService';
import { Colors } from '../theme/colors';

const LOW_SPACE_THRESHOLD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Answers "do I even need to clean up?" before the user commits to
 * swiping through anything — refreshes on focus so emptying trash (which
 * actually frees real device storage) is reflected right away.
 */
export default function StorageMeter() {
  const [info, setInfo] = useState<StorageInfo | null>(null);

  useFocusEffect(
    useCallback(() => {
      StorageService.getStorageInfo().then(setInfo);
    }, [])
  );

  if (!info) return null;

  const usedBytes = info.totalBytes - info.freeBytes;
  const usedFraction = info.totalBytes > 0 ? usedBytes / info.totalBytes : 0;
  const isLow = info.freeBytes < LOW_SPACE_THRESHOLD_BYTES;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>iPhone Storage</Text>
        <Text style={[styles.freeText, isLow && styles.freeTextLow]}>
          {formatBytes(info.freeBytes)} free
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
        {formatBytes(usedBytes)} of {formatBytes(info.totalBytes)} used
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  freeText: { color: Colors.textSecondary, fontSize: 13 },
  freeTextLow: { color: Colors.danger, fontWeight: '600' },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.trackInactive, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: Colors.accent, borderRadius: 4 },
  fillLow: { backgroundColor: Colors.danger },
  totalText: { color: Colors.textSecondary, fontSize: 12 },
});
