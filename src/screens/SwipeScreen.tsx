import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useHeaderHeight } from '@react-navigation/elements';
import SwipeDeck from '../components/SwipeDeck';
import PhotoCard from '../components/PhotoCard';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { TrashService } from '../services/TrashService';
import { SwipeRouteParams } from '../navigation/types';
import { Asset } from '../types';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';

interface SwipeHistoryEntry {
  asset: Asset;
  direction: 'left' | 'right';
}

// After this many undos in a row, nudge the user toward Trash instead of
// continuing to step back one card at a time — undo is for fixing a
// mistake, not for browsing.
const UNDO_NUDGE_THRESHOLD = 3;

// Loosely typed against just the 'Swipe' route shape rather than one
// specific stack's full param list — this screen is mounted from two
// different stacks (pushed from Categories, or as the standalone Swipe
// tab's root), and only needs goBack/canGoBack, not sibling route names.
type Props = NativeStackScreenProps<{ Swipe: SwipeRouteParams }, 'Swipe'>;

/**
 * This screen is the "composition root" for one swipe session: it asks
 * the library for photos, asks the chosen Strategy which ones qualify,
 * then hands them to the generic SwipeDeck. Notice this screen doesn't
 * know HOW the strategy decides what qualifies — it just calls
 * `strategy.match(allPhotos)`. Swap the strategy, nothing else changes.
 */
export default function SwipeScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { strategy } = route.params;
  const headerHeight = useHeaderHeight();
  const [candidates, setCandidates] = useState<Asset[] | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [freedCount, setFreedCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [history, setHistory] = useState<SwipeHistoryEntry[]>([]);
  const [undoSignal, setUndoSignal] = useState(0);
  const [consecutiveUndos, setConsecutiveUndos] = useState(0);
  // Bumping this re-runs the fetch below — used by "Swipe again" when
  // there's no previous screen to go back to (the standalone Swipe tab).
  const [sessionKey, setSessionKey] = useState(0);

  useEffect(() => {
    setCandidates(null);
    setFinished(false);
    setFreedCount(0);
    setHistory([]);
    setConsecutiveUndos(0);
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
  }, [strategy, sessionKey]);

  const handleSwipeLeft = async (asset: Asset) => {
    // Left = delete. Never permanent — see TrashService for the
    // grace period. This is the single most important safety
    // decision in the whole app.
    await TrashService.moveToTrash(asset);
    setFreedCount((c) => c + 1);
    setHistory((h) => [...h, { asset, direction: 'left' }]);
    setConsecutiveUndos(0);
  };

  const handleSwipeRight = (asset: Asset) => {
    // Right = keep. No persisted side effect, just move to next card.
    setHistory((h) => [...h, { asset, direction: 'right' }]);
    setConsecutiveUndos(0);
  };

  const handleUndo = async () => {
    const last = history[history.length - 1];
    if (!last) return;

    setHistory((h) => h.slice(0, -1));
    if (last.direction === 'left') {
      await TrashService.restore(last.asset.id);
      setFreedCount((c) => c - 1);
    }
    setFinished(false);
    setUndoSignal((s) => s + 1);

    const nextConsecutiveUndos = consecutiveUndos + 1;
    if (nextConsecutiveUndos >= UNDO_NUDGE_THRESHOLD) {
      setConsecutiveUndos(0);
      Alert.alert(t('swipe.undoLimitTitle'), t('swipe.undoLimitBody'));
    } else {
      setConsecutiveUndos(nextConsecutiveUndos);
    }
  };

  const handleDoneAction = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      setSessionKey((k) => k + 1);
    }
  }, [navigation]);

  let content;
  if (permissionDenied) {
    content = (
      <View style={[styles.center, { paddingTop: headerHeight }]}>
        <Text style={styles.emptyText}>{t('swipe.permissionDeniedTitle')}</Text>
        <Text style={styles.subText}>{t('swipe.permissionDeniedBody')}</Text>
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
        <Text style={styles.emptyText}>{t('swipe.emptyTitle')}</Text>
      </View>
    );
  } else {
    // SwipeDeck stays mounted here regardless of `finished` — its
    // internal card index lives in a ref that only survives while the
    // component is mounted. If the finished state fully replaced this
    // tree (like every other branch above), undoing from the finished
    // screen would remount a fresh SwipeDeck at index 0 instead of
    // stepping back from the real last card. The finished UI renders as
    // an overlay on top instead.
    content = (
      <View style={styles.swipeArea}>
        <View style={[styles.statusBar, { paddingTop: headerHeight + 10 }]}>
          <Text style={styles.statusText}>{t('swipe.statusQueued', { count: freedCount })}</Text>
          {history.length > 0 && (
            <Pressable onPress={handleUndo} hitSlop={8}>
              <Ionicons name="arrow-undo-circle" size={28} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
        <SwipeDeck
          data={candidates}
          renderCard={(asset) => <PhotoCard asset={asset} />}
          onSwipeLeft={handleSwipeLeft}
          onSwipeRight={handleSwipeRight}
          onEmpty={() => setFinished(true)}
          leftLabel={t('swipe.deleteLabel')}
          rightLabel={t('swipe.keepLabel')}
          undoSignal={undoSignal}
        />
        <View style={styles.hintRow}>
          <Text style={styles.hint}>{t('swipe.deleteHint')}</Text>
          <Text style={styles.hint}>{t('swipe.keepHint')}</Text>
        </View>
        {finished && (
          <View style={[styles.finishedOverlay, { paddingTop: headerHeight }]}>
            <Text style={styles.emptyText}>{t('swipe.finishedTitle')}</Text>
            <Text style={styles.subText}>
              {freedCount > 0 ? t('swipe.queuedCount', { count: freedCount }) : t('swipe.queuedZero')}
            </Text>
            <Pressable style={styles.doneButton} onPress={handleDoneAction}>
              <Text style={styles.doneButtonText}>
                {navigation.canGoBack() ? t('swipe.backToCategories') : t('swipe.swipeAgain')}
              </Text>
            </Pressable>
            {history.length > 0 && (
              <Pressable style={styles.undoLastButton} onPress={handleUndo} hitSlop={8}>
                <Text style={styles.undoLastButtonText}>{t('swipe.undoLast')}</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    );
  }

  return <View style={styles.container}>{content}</View>;
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
      padding: 24,
      gap: 8,
    },
    swipeArea: { flex: 1 },
    finishedOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
      padding: 24,
      gap: 8,
    },
    statusBar: {
      paddingHorizontal: 20,
      paddingBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    statusText: { color: colors.textSecondary, fontSize: 14 },
    emptyText: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
    subText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
    hintRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 24 },
    hint: { color: colors.textSecondary, fontSize: 14 },
    doneButton: {
      marginTop: 16,
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 24,
    },
    doneButtonText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
    undoLastButton: { marginTop: 16 },
    undoLastButtonText: { color: colors.textSecondary, fontSize: 14, textDecorationLine: 'underline' },
  });
}
