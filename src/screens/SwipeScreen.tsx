import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useHeaderHeight } from '@react-navigation/elements';
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
export default function SwipeScreen({ route, navigation }: Props) {
  const { strategy } = route.params;
  const headerHeight = useHeaderHeight();
  const [candidates, setCandidates] = useState<Asset[] | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [freedCount, setFreedCount] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    (async () => {
      const granted = await PhotoLibraryService.requestPermission();
      if (!granted) {
        setPermissionDenied(true);
        return;
      }
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

  let content;
  if (permissionDenied) {
    content = (
      <View style={[styles.center, { paddingTop: headerHeight }]}>
        <Text style={styles.emptyText}>Photo access is off</Text>
        <Text style={styles.subText}>Enable photo access in Settings to use Swipix.</Text>
      </View>
    );
  } else if (candidates === null) {
    content = (
      <View style={[styles.center, { paddingTop: headerHeight }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  } else if (candidates.length === 0) {
    content = (
      <View style={[styles.center, { paddingTop: headerHeight }]}>
        <Text style={styles.emptyText}>Nothing to review here 🎉</Text>
      </View>
    );
  } else if (finished) {
    content = (
      <View style={[styles.center, { paddingTop: headerHeight }]}>
        <Text style={styles.emptyText}>All done 🎉</Text>
        <Text style={styles.subText}>
          {freedCount > 0
            ? `${freedCount} photo${freedCount === 1 ? '' : 's'} queued for deletion.`
            : 'Nothing queued for deletion.'}
        </Text>
        <Pressable style={styles.doneButton} onPress={() => navigation.navigate('CategoryPicker')}>
          <Text style={styles.doneButtonText}>Back to categories</Text>
        </Pressable>
      </View>
    );
  } else {
    content = (
      <>
        <View style={[styles.statusBar, { paddingTop: headerHeight + 10 }]}>
          <Text style={styles.statusText}>{freedCount} photos queued for deletion</Text>
        </View>
        <SwipeDeck
          data={candidates}
          renderCard={(asset) => <PhotoCard asset={asset} />}
          onSwipeLeft={handleSwipeLeft}
          onSwipeRight={handleSwipeRight}
          onEmpty={() => setFinished(true)}
          leftLabel="DELETE"
          rightLabel="KEEP"
        />
        <View style={styles.hintRow}>
          <Text style={styles.hint}>← delete</Text>
          <Text style={styles.hint}>keep →</Text>
        </View>
      </>
    );
  }

  return <View style={styles.container}>{content}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 24,
    gap: 8,
  },
  statusBar: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusText: { color: '#8e8e93', fontSize: 14 },
  emptyText: { color: 'white', fontSize: 20, fontWeight: '700' },
  subText: { color: '#8e8e93', fontSize: 14, textAlign: 'center' },
  hintRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 24 },
  hint: { color: '#8e8e93', fontSize: 14 },
  doneButton: {
    marginTop: 16,
    backgroundColor: '#0a84ff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  doneButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
});
