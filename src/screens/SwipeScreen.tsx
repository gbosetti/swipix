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
  /** Only meaningful for 'left' entries: was this photo already in Kept
   * immediately before this swipe (e.g. reconsidering it in the Kept
   * tab)? If so, undoing this swipe needs to restore that status, not
   * just pull it back out of Trash. */
  wasKept?: boolean;
}

// After this many undos in a row, nudge the user toward Trash instead of
// continuing to step back one card at a time — undo is for fixing a
// mistake, not for browsing.
const UNDO_NUDGE_THRESHOLD = 3;

// Small enough to load fast (the whole reason this file paginates instead
// of fetching everything up front — see PhotoLibraryService.getMediaPage),
// big enough to feel like a full deck. Also how much the fetch window
// (windowSizeRef) grows by each cycle — see its own comment above.
const PAGE_SIZE = 60;
// Both "top up now" trigger and the minimum number of NEW matches a fetch
// cycle tries to accumulate before stopping.
const MIN_BUFFER = 15;
// Safety cap per fetch cycle (10 * PAGE_SIZE = 600 raw assets scanned,
// comparable to or better than the old flat 500) so a genuinely sparse or
// empty category (e.g. Screenshots with none in the library) still
// resolves to "empty" instead of paging through the whole library.
const MAX_PAGE_ATTEMPTS_PER_CYCLE = 10;

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
  // route.params only ever carries plain data (see SwipeRouteParams) —
  // reconstructed into a real CategoryStrategy here, once per navigation
  // (route.params keeps the same object identity for the lifetime of this
  // screen instance, so this only re-runs when it's genuinely a new session).
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
  // Bumping this re-runs the fetch below — used by "Swipe again" when
  // there's no previous screen to go back to (the standalone Swipe tab).
  const [sessionKey, setSessionKey] = useState(0);

  // Pagination state — refs, not React state, since they're read/written
  // from inside async loops and swipe handlers without needing a re-render
  // of their own (only `candidates` changing triggers a re-render).
  //
  // windowSizeRef, not a cursor: confirmed via reading expo-media-library's
  // native iOS pagination (MediaLibraryUtilities.swift) that passing an
  // `after` cursor resolves it via `fetchResult.index(of: cursor)` against
  // a BRAND NEW PHFetchResult built fresh on every call. PHFetchResult's
  // ordering for assets that tie on the sort key (creationDate — very
  // common: bulk imports, WhatsApp/social-media saves, restored backups)
  // isn't guaranteed stable across independently-built fetch results, so
  // that index lookup can land far past where the previous page actually
  // ended — flipping hasNextPage to false after only a few pages even
  // though most of the library is unseen (reproduced: "All Photos" showing
  // "finished" after swiping only a few). Every branch of the native code
  // skips that lookup entirely when no cursor is passed, so instead of
  // `after`, every fetch asks for the whole growing window from the start
  // (first: windowSize, no after) and only the newly-appeared slice is
  // matched — sidesteps the bug completely rather than working around it.
  const windowSizeRef = useRef(0);
  const hasNextPageRef = useRef(true);
  const fetchingMoreRef = useRef(false);
  // Mirrors how many cards the user has swiped through this session —
  // SwipeDeck tracks its own index internally, but doesn't expose it, so
  // this is incremented/decremented in lockstep by the same handlers that
  // already fire once per swipe/undo.
  const swipedCountRef = useRef(0);
  // Mirrors `candidates?.length` so the "did a top-up fetch just find the
  // true end of the library?" check below doesn't need to read the
  // (possibly stale-by-then) `candidates` closure from whichever render
  // scheduled the fetch.
  const candidatesLengthRef = useRef(0);
  // Every id ever added to `candidates` this session. Needed because
  // "self-fetching" strategies (Duplicates & Similar is the one that
  // matters here) ignore the page they're handed and re-scan their whole
  // dataset from scratch on every call — so a background top-up can
  // legitimately return almost the same match set as the one already on
  // screen. Without this, the same photo lands at multiple positions in
  // the deck, gets swiped (and trashed/kept) more than once with
  // inconsistent decisions, and duplicate ids in Trash/Kept break their
  // list rendering (confirmed: "two children with the same key").
  const seenIdsRef = useRef<Set<string>>(new Set());
  // Bumped every time a fresh session starts (strategy or sessionKey
  // change) — every async continuation below checks this before touching
  // state, so a background fetch from a stale session can't leak into a
  // new one (e.g. the user backed out and picked a different category
  // while a page fetch was still in flight).
  const sessionTokenRef = useRef(0);

  // Fetches pages (via PhotoLibraryService.getMediaPage, scoped to whatever
  // media types the active strategy declares it needs) and runs them
  // through the strategy, accumulating matches until there are enough to
  // be worth showing, the library is exhausted, or the safety cap is hit.
  // Used both for the very first load and for background top-ups — the
  // only difference is what the caller does with the result.
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

  // Kicks off a background fetch for more candidates once the user is
  // getting close to the end of what's currently loaded. A no-op while a
  // fetch is already in flight, or once the library's been fully paged
  // through (hasNextPageRef is false).
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
          // Truly exhausted: no more pages, this fetch found nothing new,
          // and the user already swiped through everything loaded so far.
          // SwipeDeck's own onEmpty won't fire again on its own here since
          // no further swipe happens — this is the only place left to
          // surface "finished" for this case.
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
      // Set even when empty — that's what lets the screen fall through to
      // the "empty" branch below instead of spinning forever.
      setCandidates(matches);
    })();
  }, [strategy, sessionKey, fetchMoreMatches]);

  const handleSwipeLeft = async (asset: Asset) => {
    // Left = delete. Never permanent — see TrashService: it only stages
    // the photo, permanent deletion requires an explicit later action.
    // This is the single most important safety decision in the whole app.
    const wasKept = await KeptService.isKept(asset.id);
    await TrashService.moveToTrash(asset);
    // Covers reconsidering a kept photo (Kept tab) and the rarer case of
    // re-encountering an already-kept photo in a normal category swipe —
    // a delete decision always overrides a previous keep, so a photo is
    // never left sitting in both Trash and Kept at once. A harmless
    // no-op otherwise (removing an id that was never kept).
    await KeptService.removeKept(asset.id);
    setFreedCount((c) => c + 1);
    setHistory((h) => [...h, { asset, direction: 'left', wasKept }]);
    setConsecutiveUndos(0);
    swipedCountRef.current += 1;
    maybeTopUp((candidates?.length ?? 0) - swipedCountRef.current);
  };

  const handleSwipeRight = async (asset: Asset) => {
    // Right = keep. Recorded in KeptService (not just this session) so
    // it shows up in the Kept tab for reconsidering later.
    await KeptService.addKept(asset);
    setHistory((h) => [...h, { asset, direction: 'right' }]);
    setConsecutiveUndos(0);
    swipedCountRef.current += 1;
    maybeTopUp((candidates?.length ?? 0) - swipedCountRef.current);
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
          renderCard={(asset, isTop) => <PhotoCard asset={asset} isTop={isTop} />}
          onSwipeLeft={handleSwipeLeft}
          onSwipeRight={handleSwipeRight}
          onEmpty={() => {
            // The deck can run dry mid-fetch (more pages are still on the
            // way, or a fetch just hasn't been kicked off yet this tick) —
            // only treat it as truly "finished" once there's nothing left
            // to page in. SwipeDeck resumes on its own as soon as
            // `candidates` grows past the current index.
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
