import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import SwipeDeck from '../components/SwipeDeck';
import PhotoCard from '../components/PhotoCard';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { TrashService } from '../services/TrashService';
import { RootStackParamList } from '../navigation/types';
import { Asset } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Swipe'>;

/**
 * This screen is the "composition root" for one swipe session: it asks
 * the library for photos, asks the chosen Strategy which ones qualify,
 * then hands them to the generic SwipeDeck. Notice this screen doesn't
 * know HOW the strategy decides what qualifies — it just calls
 * `strategy.match(allPhotos)`. Swap the strategy, nothing else changes.
 */
export default function SwipeScreen({ route }: Props) {
  const { strategy } = route.params;
  const [candidates, setCandidates] = useState<Asset[] | null>(null);
  const [freedCount, setFreedCount] = useState(0);

  useEffect(() => {
    (async () => {
      const granted = await PhotoLibraryService.requestPermission();
      if (!granted) return;
      const all = await PhotoLibraryService.getAllPhotos();
      const matched = await strategy.match(all);
      setCandidates(matched);
    })();
  }, [strategy]);

  const handleSwipeLeft = async (asset: Asset) => {
    // Left = delete. Never permanent — see TrashService for the
    // 24h grace period. This is the single most important safety
    // decision in the whole app.
    await TrashService.moveToTrash(asset);
    setFreedCount((c) => c + 1);
  };

  const handleSwipeRight = () => {
    // Right = keep. No action needed, just move to next card.
  };

  if (candidates === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (candidates.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Nothing to review here 🎉</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>{freedCount} photos queued for deletion</Text>
      </View>
      <SwipeDeck
        data={candidates}
        renderCard={(asset) => <PhotoCard asset={asset} />}
        onSwipeLeft={handleSwipeLeft}
        onSwipeRight={handleSwipeRight}
        onEmpty={() => {}}
      />
      <View style={styles.hintRow}>
        <Text style={styles.hint}>← delete</Text>
        <Text style={styles.hint}>keep →</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  statusBar: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 10 },
  statusText: { color: '#8e8e93', fontSize: 14 },
  emptyText: { color: 'white', fontSize: 18 },
  hintRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 24 },
  hint: { color: '#8e8e93', fontSize: 14 },
});
