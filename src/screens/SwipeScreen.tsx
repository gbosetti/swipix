import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useHeaderHeight } from '@react-navigation/elements';
import SwipeDeck from '../components/SwipeDeck';
import PhotoCard from '../components/PhotoCard';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { TrashService } from '../services/TrashService';
import { KeptService } from '../services/KeptService';
import { createStrategy } from '../strategies/strategyRegistry';
import { SwipeRouteParams } from '../navigation/types';
import { Asset } from '../types';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';

interface SwipeHistoryEntry {
  asset: Asset;
  direction: 'left' | 'right';
  /** Was this already Kept before the swipe (e.g. reconsidered from the
   * Kept tab)? Undo needs to restore that, not just pull it out of Trash. */
  wasKept?: boolean;
}

// After this many undos in a row, nudge toward Trash instead of stepping
// back one card at a time.
const UNDO_NUDGE_THRESHOLD = 3;

// Small enough to load fast, big enough to feel like a full deck. Also how
// much the fetch window (windowSizeRef) grows by each cycle.
const PAGE_SIZE = 60;
// Both the "top up now" trigger and the minimum new matches per fetch cycle.
const MIN_BUFFER = 15;
// Safety cap per fetch cycle so a sparse/empty category still resolves to
// "empty" instead of paging through the whole library.
const MAX_PAGE_ATTEMPTS_PER_CYCLE = 10;

// Loosely typed against just the route shape — this screen mounts from two
// different stacks and only needs goBack/canGoBack.
type Props = NativeStackScreenProps<{ Swipe: SwipeRouteParams }, 'Swipe'>;

/**
 * Composition root for one swipe session: fetches candidates, asks the
 * chosen {@link Strategy} which qualify, hands them to {@link SwipeDeck}.
 * Doesn't know HOW a strategy decides what qualifies.
 */
export default function SwipeScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { strategyId, params: strategyParams } = route.params;
  const strategy = useMemo(
    () => createStrategy(strategyId, strategyParams),
    [strategyId, strategyParams]
  );
  const headerHeight = useHeaderHeight();
  const [candidates, setCandidates] = useState<Asset[] | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [freedCount, setFreedCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [history, setHistory] = useState<SwipeHistoryEntry[]>([]);
  const [undoSignal, setUndoSignal] = useState(0);
  const [consecutiveUndos, setConsecutiveUndos] = useState(0);
  // Bumped by "Swipe again" when there's no previous screen to go back to.
  const [sessionKey, setSessionKey] = useState(0);

  // Refs, not state — read/written from async loops and swipe handlers
  // without needing their own re-render.
  //
  // windowSizeRef, not a cursor: expo-media-library's iOS cursor resolution
  // (`fetchResult.index(of:)` against a fresh PHFetchResult each call) isn't
  // reliable when assets tie on the sort key — the index can land past
  // where the previous page ended, flipping hasNextPage to false too early.
  // Growing `first` from 0 and slicing off only the new tail sidesteps it.
  const windowSizeRef = useRef(0);
  const hasNextPageRef = useRef(true);
  const fetchingMoreRef = useRef(false);
  // Mirrors how many cards have been swiped — SwipeDeck tracks its own
  // index but doesn't expose it.
  const swipedCountRef = useRef(0);
  // Mirrors candidates?.length without reading a possibly-stale closure.
  const candidatesLengthRef = useRef(0);
  // Every id ever added this session. Needed because self-fetching
  // strategies (Duplicates & Similar) re-scan their whole dataset on every
  // call, so a top-up can return matches already on screen — without this,
  // the same photo could land at two deck positions and get decided twice.
  const seenIdsRef = useRef<Set<string>>(new Set());
  // Bumped on every fresh session (strategy or sessionKey change) so a
  // stale background fetch can't leak state into a newer session.
  const sessionTokenRef = useRef(0);

  /** Pages through the library via the strategy, accumulating matches
   * until there's enough to show, the library's exhausted, or the safety
   * cap hits. Shared by the initial load and background top-ups. */
  const fetchMoreMatches = useCallback(
    async (token: number): Promise<Asset[]> => {
      const collected: Asset[] = [];
      let attempts = 0;
      while (
        collected.length < MIN_BUFFER &&
        hasNextPageRef.current &&
        attempts < MAX_PAGE_ATTEMPTS_PER_CYCLE
      ) {
        const page = await PhotoLibraryService.getMediaPage({
          mediaTypes: strategy.mediaTypes,
          first: windowSizeRef.current + PAGE_SIZE,
          detailed: strategy.needsDetailedFetch,
          albumId: strategy.albumId,
        });
        if (token !== sessionTokenRef.current) return collected;
        const newAssets = page.assets.slice(windowSizeRef.current);
        windowSizeRef.current = page.assets.length;
        hasNextPageRef.current = page.hasNextPage;
        for (const asset of await strategy.match(newAssets)) {
          if (seenIdsRef.current.has(asset.id)) continue;
          seenIdsRef.current.add(asset.id);
          collected.push(asset);
        }
        if (token !== sessionTokenRef.current) return collected;
        attempts += 1;
      }
      return collected;
    },
    [strategy]
  );

  /** Kicks off a background fetch once the deck is running low. No-op
   * while a fetch is already in flight or the library's fully paged. */
  const maybeTopUp = useCallback(
    (remaining: number) => {
      if (remaining > MIN_BUFFER) return;
      if (fetchingMoreRef.current || !hasNextPageRef.current) return;
      const token = sessionTokenRef.current;
      fetchingMoreRef.current = true;
      fetchMoreMatches(token).then((more) => {
        if (token !== sessionTokenRef.current) return;
        fetchingMoreRef.current = false;
        if (more.length > 0) {
          candidatesLengthRef.current += more.length;
          setCandidates((prev) => (prev ? [...prev, ...more] : more));
        } else if (!hasNextPageRef.current && swipedCountRef.current >= candidatesLengthRef.current) {
          // Truly exhausted and no further swipe will happen to re-trigger
          // SwipeDeck's own onEmpty — this is the last place left to
          // surface "finished".
          setFinished(true);
        }
      });
    },
    [fetchMoreMatches]
  );

  useEffect(() => {
    const token = ++sessionTokenRef.current;
    windowSizeRef.current = 0;
    hasNextPageRef.current = true;
    fetchingMoreRef.current = false;
    swipedCountRef.current = 0;
    candidatesLengthRef.current = 0;
    seenIdsRef.current = new Set();
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
      const matches = await fetchMoreMatches(token);
      if (token !== sessionTokenRef.current) return;
      candidatesLengthRef.current = matches.length;
      // Set even when empty, so the screen falls through to "empty" below.
      setCandidates(matches);
    })();
  }, [strategy, sessionKey, fetchMoreMatches]);

  const handleSwipeLeft = async (asset: Asset) => {
    // Never permanent — TrashService only stages it.
    const wasKept = await KeptService.isKept(asset.id);
    await TrashService.moveToTrash(asset);
    // A delete always overrides a previous keep, so nothing sits in both
    // Trash and Kept. No-op if it was never kept.
    await KeptService.removeKept(asset.id);
    setFreedCount((c) => c + 1);
    setHistory((h) => [...h, { asset, direction: 'left', wasKept }]);
    setConsecutiveUndos(0);
    swipedCountRef.current += 1;
    maybeTopUp((candidates?.length ?? 0) - swipedCountRef.current);
  };

  const handleSwipeRight = async (asset: Asset) => {
    await KeptService.addKept(asset);
    setHistory((h) => [...h, { asset, direction: 'right' }]);
    setConsecutiveUndos(0);
    swipedCountRef.current += 1;
    maybeTopUp((candidates?.length ?? 0) - swipedCountRef.current);
  };

  /** A photo that fails to load must never be swipeable — left/right would
   * delete or keep something never seen. Not a decision: no Trash, no
   * Kept, no history entry, just dropped from the deck. */
  const handleCardLoadError = (asset: Asset) => {
    setCandidates((prev) => (prev ? prev.filter((a) => a.id !== asset.id) : prev));
    candidatesLengthRef.current = Math.max(0, candidatesLengthRef.current - 1);
    maybeTopUp((candidates?.length ?? 1) - 1 - swipedCountRef.current);
  };

  const handleUndo = async () => {
    const last = history[history.length - 1];
    if (!last) return;

    setHistory((h) => h.slice(0, -1));
    if (last.direction === 'left') {
      await TrashService.restore(last.asset.id);
      if (last.wasKept) {
        await KeptService.addKept(last.asset);
      }
      setFreedCount((c) => c - 1);
    } else {
      await KeptService.removeKept(last.asset.id);
    }
    if (swipedCountRef.current > 0) swipedCountRef.current -= 1;
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
    // SwipeDeck stays mounted regardless of `finished` — its card index is
    // a ref, so replacing this tree would remount at index 0 instead of
    // stepping back from the real last card on Undo. Finished renders as
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
          renderCard={(asset, isTop) => (
            <PhotoCard asset={asset} isTop={isTop} onLoadError={() => handleCardLoadError(asset)} />
          )}
          onSwipeLeft={handleSwipeLeft}
          onSwipeRight={handleSwipeRight}
          onEmpty={() => {
            // Can run dry mid-fetch — only "finished" once nothing's left
            // to page in. SwipeDeck resumes on its own once candidates grows.
            if (hasNextPageRef.current || fetchingMoreRef.current) return;
            setFinished(true);
          }}
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
