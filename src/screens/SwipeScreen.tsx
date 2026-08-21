import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useHeaderHeight } from '@react-navigation/elements';
import * as Sharing from 'expo-sharing';
import SwipeDeck from '../components/SwipeDeck';
import PhotoCard from '../components/PhotoCard';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { TrashService } from '../services/TrashService';
import { KeptService } from '../services/KeptService';
import { beginForegroundSession, ForegroundSession } from '../services/ForegroundSession';
import { createStrategy } from '../strategies/strategyRegistry';
import { SwipeRouteParams } from '../navigation/types';
import { Asset, ScanProgressCallback } from '../types';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';

interface SwipeHistoryEntry {
  asset: Asset;
  direction: 'left' | 'right';
  /**
   * Was this already Kept before the swipe (e.g. reconsidered from the
   * Kept tab)? Undo needs to restore that, not just pull it out of Trash.
   */
  wasKept?: boolean;
}

// After this many undos in a row, nudge toward Trash instead of stepping
// back one card at a time.
const UNDO_NUDGE_THRESHOLD = 3;

// Small enough to load fast, big enough to feel like a full deck. Also how
// much the fetch window (windowSizeRef) grows by each cycle.
const PAGE_SIZE = 60;
// Both the "top up now" trigger and the minimum a background top-up tries
// to accumulate before stopping.
const MIN_BUFFER = 15;
// The initial load shows the deck as soon as a batch finds anything at
// all, rather than silently scanning further batches to reach MIN_BUFFER
// first — swiping should start as soon as there's something to swipe.
// Background top-ups (already showing a deck, no loading UI to wait on)
// keep using MIN_BUFFER.
const INITIAL_REVEAL_THRESHOLD = 1;
// Safety cap per fetch cycle so a sparse/empty category still resolves to
// "empty" instead of paging through the whole library.
const MAX_PAGE_ATTEMPTS_PER_CYCLE = 10;
// A top-up retries automatically while the deck's run dry (see
// runTopUpCycle) — bounded across the whole retry chain, not just one
// cycle, so a genuinely rare category (Big Pictures in a huge library)
// can't monopolize the shared native-call pool indefinitely at 'high'
// priority, starving unrelated background work (e.g. Categories' own
// video previews). 10 cycles × MAX_PAGE_ATTEMPTS_PER_CYCLE × PAGE_SIZE is
// a generous search before pausing to let the user decide whether to
// keep going.
const MAX_TOPUP_RETRY_CYCLES = 10;

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
  // Populated during the initial load for any strategy — a sparse filter
  // (e.g. Screenshots in a huge library) can page through several fetches
  // before finding even one match, which is exactly the kind of loading
  // delay a bare spinner hides. Left null between updates, so a fetch that
  // never reports (nothing to report — e.g. permission still resolving)
  // just shows the plain spinner instead of a stuck bar.
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);
  // True only once the deck has actually run dry (not just "running low")
  // and a top-up is searching for more — see maybeTopUp. Distinct from
  // `finished`: the library isn't known to be exhausted yet.
  const [waitingForMore, setWaitingForMore] = useState(false);
  // True once the automatic retry budget (MAX_TOPUP_RETRY_CYCLES) runs out
  // without either finding more or exhausting the library — deliberately
  // NOT the same as `finished`: we genuinely don't know whether more
  // matches exist further in, so it'd be dishonest to claim "all done".
  // Offers a manual "search more" action instead of silently stopping.
  const [searchPaused, setSearchPaused] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [freedCount, setFreedCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [history, setHistory] = useState<SwipeHistoryEntry[]>([]);
  // Drives the Undo button's disabled/dimmed appearance — the actual
  // re-entrancy gate is undoInFlightRef below, not this; state updates
  // aren't guaranteed to be visible synchronously to a second call fired
  // immediately after the first (confirmed: two back-to-back calls with
  // no gap between them could both still read this as false).
  const [undoInFlight, setUndoInFlight] = useState(false);
  const [undoSignal, setUndoSignal] = useState(0);
  const [skipSignal, setSkipSignal] = useState(0);
  const [consecutiveUndos, setConsecutiveUndos] = useState(0);
  // Bumped by "Swipe again" when there's no previous screen to go back to.
  const [sessionKey, setSessionKey] = useState(0);
  // A playing video needs to know this too, not just whether it's the top
  // card of its own deck — see the useFocusEffect below.
  const [screenFocused, setScreenFocused] = useState(true);

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
  /**
   * The real Undo re-entrancy gate — a ref, not state, so it's visible
   * synchronously to a second handleUndo call fired immediately after
   * the first, with no render in between. handleUndo reads
   * `history[history.length - 1]` directly (not via a functional state
   * update) before its Trash/Kept awaits — without this gate, two
   * overlapping calls could both read the same not-yet-popped last
   * entry, undo it twice, and silently skip the entry before it. That
   * skipped entry would stay recorded in its original list (e.g. Trash)
   * while also reappearing in the deck as swipeable again — if then
   * swiped the other way, it would end up in both Trash and Kept at
   * once, and a later "Empty Trash Now" would permanently delete a photo
   * the user had just chosen to keep. Confirmed with a test: a
   * state-only version of this guard (undoInFlight above) let a second,
   * immediately-following call through, since React doesn't guarantee
   * the updated state is visible to that second call before its own
   * render.
   */
  const undoInFlightRef = useRef(false);
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
  // Renewed on every fresh session (strategy or sessionKey change) and on
  // every focus — shared across screens via ForegroundSession, so opening
  // a category correctly supersedes CategoryPickerScreen's own background
  // preview work, and leaving this screen supersedes this scan in turn.
  const sessionRef = useRef<ForegroundSession | null>(null);

  /**
   * Pages through the library via the strategy, accumulating matches
   * until there's enough to show, the library's exhausted, or the safety
   * cap hits. Shared by the initial load (minMatches=INITIAL_REVEAL_THRESHOLD,
   * so it returns as soon as a batch finds anything) and background
   * top-ups (minMatches=MIN_BUFFER) — only the initial load passes
   * `onProgress`, since background top-ups have no visible loading state
   * for it to update.
   */
  const fetchMoreMatches = useCallback(
    async (
      session: ForegroundSession,
      minMatches: number,
      onProgress?: ScanProgressCallback
    ): Promise<Asset[]> => {
      // Passed all the way down to PhotoLibraryService so an item that
      // hasn't started its own native call yet can skip it once this
      // session is abandoned — the outer checks below only stop this loop
      // from launching the NEXT page fetch, they don't stop one already
      // in flight from making every one of its own native calls
      // regardless (see PhotoLibraryService.getMediaPage's `isCancelled`
      // for why that matters).
      const isCancelled = () => !session.isCurrent();
      const collected: Asset[] = [];
      let attempts = 0;
      while (
        collected.length < minMatches &&
        hasNextPageRef.current &&
        attempts < MAX_PAGE_ATTEMPTS_PER_CYCLE
      ) {
        const page = await PhotoLibraryService.getMediaPage({
          mediaTypes: strategy.mediaTypes,
          first: windowSizeRef.current + PAGE_SIZE,
          detailed: strategy.needsDetailedFetch,
          albumId: strategy.albumId,
          createdAfter: strategy.dateRange?.after,
          createdBefore: strategy.dateRange?.before,
          onProgress,
          // An active swipe session shouldn't queue behind CategoryPicker-
          // Screen's own background preview fetches for the shared native
          // call budget.
          priority: 'high',
          isCancelled,
        });
        if (isCancelled()) {
          return collected;
        }
        const newAssets = page.assets.slice(windowSizeRef.current);
        windowSizeRef.current = page.assets.length;
        hasNextPageRef.current = page.hasNextPage;
        const matched = await strategy.match(newAssets, {
          onProgress,
          priority: 'high',
          isCancelled,
        });
        for (const asset of matched) {
          if (seenIdsRef.current.has(asset.id)) {
            continue;
          }
          seenIdsRef.current.add(asset.id);
          collected.push(asset);
        }
        if (isCancelled()) {
          return collected;
        }
        attempts += 1;
      }
      return collected;
    },
    [strategy]
  );

  /**
   * One fetch cycle of a (possibly multi-cycle) top-up, always re-checking
   * "is the deck actually empty right now" from live refs rather than a
   * snapshot — a retry chain can outlive several more swipes, so a
   * `remaining` value captured when it started can go stale by the time
   * it resolves. Recurses while `fetchMoreMatches`'s own per-call safety
   * cap (MAX_PAGE_ATTEMPTS_PER_CYCLE) is hit without the library actually
   * being exhausted — that cap isn't proof there's nothing left, just
   * that this batch didn't have it. Confirmed on a real device: reusing
   * the original snapshot here left a sparse category (Big Pictures) with
   * a blank screen — no spinner, no "finished" — once the user swiped
   * through everything while a stale-remaining retry loop kept churning
   * in the background without ever noticing the deck had gone empty.
   *
   * Bounded by `cycle`/MAX_TOPUP_RETRY_CYCLES, not just recursing forever:
   * a genuinely rare category could otherwise keep this chain running at
   * 'high' priority for as long as the library has assets left, starving
   * unrelated background work (confirmed on a real device: Categories'
   * own video-preview fetches for other cards were left queued behind an
   * open-ended Big Pictures search). Once the budget runs out with
   * `hasNextPage` still true, this pauses rather than claiming "finished"
   * — the library isn't actually known to be exhausted, just not fully
   * searched yet — and hands control to the manual "search more" action.
   */
  const runTopUpCycle = useCallback(
    (session: ForegroundSession, cycle = 0) => {
      const deckIsEmpty = swipedCountRef.current >= candidatesLengthRef.current;
      if (deckIsEmpty) {
        setWaitingForMore(true);
        setSearchPaused(false);
      }
      fetchMoreMatches(
        session,
        MIN_BUFFER,
        deckIsEmpty ? (done, total) => { if (session.isCurrent()) {setScanProgress({ done, total });} } : undefined
      )
        .then((more) => {
          if (!session.isCurrent()) {
            return;
          }
          if (more.length > 0) {
            fetchingMoreRef.current = false;
            candidatesLengthRef.current += more.length;
            setCandidates((prev) => (prev ? [...prev, ...more] : more));
            setWaitingForMore(false);
            setScanProgress(null);
          } else if (hasNextPageRef.current && cycle < MAX_TOPUP_RETRY_CYCLES) {
            // This cycle's cap was hit, not the library — keep searching.
            runTopUpCycle(session, cycle + 1);
          } else {
            fetchingMoreRef.current = false;
            setWaitingForMore(false);
            setScanProgress(null);
            if (swipedCountRef.current >= candidatesLengthRef.current) {
              if (!hasNextPageRef.current) {
                // Truly exhausted and no further swipe will happen to
                // re-trigger SwipeDeck's own onEmpty — this is the last
                // place left to surface "finished".
                setFinished(true);
              } else {
                // Retry budget spent, library not exhausted — pause and
                // let the user decide whether it's worth searching further.
                setSearchPaused(true);
              }
            }
          }
        })
        .catch((error) => {
          // A rejection here (e.g. a page-level native call timing out)
          // must never just vanish — that's exactly what left a swipe
          // session permanently stuck before: fetchingMoreRef never reset,
          // so neither a retry nor "finished" could ever fire again.
          if (__DEV__) {
            console.warn('runTopUpCycle failed:', error);
          }
          if (!session.isCurrent()) {
            return;
          }
          fetchingMoreRef.current = false;
          setWaitingForMore(false);
          setScanProgress(null);
          if (swipedCountRef.current >= candidatesLengthRef.current) {
            setSearchPaused(true);
          }
        });
    },
    [fetchMoreMatches]
  );

  /**
   * Kicks off a background fetch once the deck is running low. No-op
   * while a fetch is already in flight or the library's fully paged.
   */
  const maybeTopUp = useCallback(
    (remaining: number) => {
      if (remaining > MIN_BUFFER) {
        return;
      }
      if (fetchingMoreRef.current || !hasNextPageRef.current) {
        return;
      }
      const session = sessionRef.current;
      if (!session) {
        return;
      }
      fetchingMoreRef.current = true;
      runTopUpCycle(session);
    },
    [runTopUpCycle]
  );

  /**
   * Manual fallback for when the automatic retry budget ran out without
   * an answer either way — re-enters the same bounded retry chain with a
   * fresh budget, rather than searching unboundedly even on an explicit
   * user request.
   */
  const handleSearchMore = useCallback(() => {
    if (fetchingMoreRef.current) {
      return;
    }
    const session = sessionRef.current;
    if (!session) {
      return;
    }
    setSearchPaused(false);
    fetchingMoreRef.current = true;
    runTopUpCycle(session);
  }, [runTopUpCycle]);

  useEffect(() => {
    const session = beginForegroundSession();
    sessionRef.current = session;
    windowSizeRef.current = 0;
    hasNextPageRef.current = true;
    fetchingMoreRef.current = false;
    swipedCountRef.current = 0;
    candidatesLengthRef.current = 0;
    seenIdsRef.current = new Set();
    setCandidates(null);
    setScanProgress(null);
    setWaitingForMore(false);
    setSearchPaused(false);
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
      let matches: Asset[] = [];
      let cycle = 0;
      try {
        /**
         * A sparse category can still come back empty within one cycle's
         * MAX_PAGE_ATTEMPTS_PER_CYCLE cap. Retries (same budget a
         * post-swipe top-up uses) before concluding there's nothing.
         */
        while (
          matches.length === 0 &&
          hasNextPageRef.current &&
          cycle < MAX_TOPUP_RETRY_CYCLES
        ) {
          matches = await fetchMoreMatches(session, INITIAL_REVEAL_THRESHOLD, (done, total) => {
            if (session.isCurrent()) {
              setScanProgress({ done, total });
            }
          });
          if (!session.isCurrent()) {
            return;
          }
          cycle += 1;
        }
      } catch (error) {
        // A rejection (e.g. a page-level native call timing out) must
        // never leave the initial spinner stuck forever with nothing to
        // recover to — falls through to "empty" below, same as a
        // genuinely empty category, rather than hanging indefinitely.
        if (__DEV__) {
          console.warn('Initial load failed:', error);
        }
      }
      if (!session.isCurrent()) {
        return;
      }
      candidatesLengthRef.current = matches.length;
      setScanProgress(null);
      // Set even when empty, so the screen falls through to "empty" below.
      setCandidates(matches);
      if (matches.length === 0 && hasNextPageRef.current) {
        // Retry budget spent without finding anything, but the library
        // isn't known to be exhausted — same honest "paused, not empty"
        // state a post-swipe top-up falls back to in this situation,
        // with the same manual "search more" escape hatch.
        setSearchPaused(true);
      }
    })();
  }, [strategy, sessionKey, fetchMoreMatches]);

  // A screen the user has navigated away from (back, tab switch) can stay
  // mounted but unfocused — bottom-tab navigators don't unmount other
  // tabs' stacks. Ending the session on blur is what actually stops an
  // abandoned scan: it can't cancel a native call already in flight (no
  // cancellation API), but it stops fetchMoreMatches from launching any
  // further ones once the user's left, and — since sessions are shared
  // across screens — clears the way for CategoryPickerScreen's own
  // preview work to matter again the moment the user's back on it. If the
  // scan hadn't finished yet (the standalone Swipe tab case — SwipeScreen
  // stays mounted, so it won't get a fresh mount to retry with),
  // abandonedMidScanRef flags it so returning to this same screen resumes
  // instead of sitting on a spinner that nothing will ever resolve.
  //
  // Reads candidatesRef, not candidates directly, and keeps the callback
  // passed to useFocusEffect referentially stable ([] deps): React
  // Navigation's useFocusEffect re-subscribes (running this cleanup, then
  // immediately re-invoking the effect) whenever the callback's identity
  // changes, not just on a real focus/blur — with `candidates` in the dep
  // array, every setCandidates call (initial load, every top-up) looked
  // exactly like "blurred while candidates was still null" to the stale
  // per-render closure, tripped abandonedMidScanRef, and immediately
  // resumed via a sessionKey bump — an infinite reset loop that never let
  // the screen settle (confirmed on a real device: Swipe never finished
  // loading).
  const candidatesRef = useRef<Asset[] | null>(null);
  useEffect(() => {
    candidatesRef.current = candidates;
  });
  const abandonedMidScanRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      if (abandonedMidScanRef.current) {
        abandonedMidScanRef.current = false;
        setSessionKey((k) => k + 1);
      }
      return () => {
        // A playing video must stop making sound the instant this screen
        // loses focus — confirmed on a real device: switching to another
        // tab left a video's audio running in the background, since
        // VideoCard's own play/pause logic only knows "am I the top card
        // of my own deck" (isTop), which never changes just because the
        // whole screen (a bottom-tab sibling) went out of focus.
        setScreenFocused(false);
        if (candidatesRef.current === null) {
          abandonedMidScanRef.current = true;
        }
        sessionRef.current?.end();
      };
    }, [])
  );

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

  /**
   * Not a decision — no Trash, no Kept, no history entry, so there's
   * nothing for Undo to reverse. Since the asset is never marked decided
   * anywhere, it stays eligible to reappear in this same category later.
   */
  const handleSkip = () => {
    swipedCountRef.current += 1;
    maybeTopUp((candidates?.length ?? 0) - swipedCountRef.current);
  };

  const handleSkipPress = () => {
    setSkipSignal((s) => s + 1);
  };

  /**
   * A photo that fails to load must never be swipeable — left/right would
   * delete or keep something never seen. Not a decision: no Trash, no
   * Kept, no history entry, just dropped from the deck.
   */
  const handleCardLoadError = (asset: Asset) => {
    setCandidates((prev) => (prev ? prev.filter((a) => a.id !== asset.id) : prev));
    candidatesLengthRef.current = Math.max(0, candidatesLengthRef.current - 1);
    maybeTopUp((candidates?.length ?? 1) - 1 - swipedCountRef.current);
  };

  /**
   * Never a swipe decision — opens the OS share sheet for whatever's
   * currently shown, leaving the card and deck untouched either way.
   */
  const handleShare = async (asset: Asset) => {
    try {
      const uri = await PhotoLibraryService.getShareableUri(asset.id);
      if (!uri || !(await Sharing.isAvailableAsync())) {
        Alert.alert(t('swipe.shareFailedTitle'), t('swipe.shareFailedBody'));
        return;
      }
      await Sharing.shareAsync(uri);
    } catch (error) {
      if (__DEV__) {
        console.warn('Share failed:', error);
      }
      Alert.alert(t('swipe.shareFailedTitle'), t('swipe.shareFailedBody'));
    }
  };

  const handleUndo = async () => {
    if (undoInFlightRef.current) {
      return;
    }
    const last = history[history.length - 1];
    if (!last) {
      return;
    }

    undoInFlightRef.current = true;
    setUndoInFlight(true);
    try {
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
      if (swipedCountRef.current > 0) {
        swipedCountRef.current -= 1;
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
    } finally {
      undoInFlightRef.current = false;
      setUndoInFlight(false);
    }
  };

  const handleDoneAction = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      setSessionKey((k) => k + 1);
    }
  }, [navigation]);

  // Shared by the initial load and the "deck ran dry, still searching"
  // overlay below — same honest, chunk-by-chunk progress either way.
  const scanProgressBar = scanProgress && (
    <View style={styles.scanProgressWrap}>
      <View style={styles.scanProgressTrack}>
        <View
          style={[
            styles.scanProgressFill,
            { width: `${Math.min(100, (scanProgress.done / scanProgress.total) * 100)}%` },
          ]}
        />
      </View>
      <Text style={styles.scanProgressText}>{t('swipe.scanningProgress', scanProgress)}</Text>
    </View>
  );

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
        {scanProgressBar}
      </View>
    );
  } else if (candidates.length === 0 && searchPaused) {
    // The initial load's own retry budget ran out without finding a
    // match, but the library isn't known to be exhausted — same honest
    // "paused, not empty" state and manual retry as the post-swipe case,
    // rather than falsely claiming there's nothing here at all.
    content = (
      <View style={[styles.center, { paddingTop: headerHeight }]}>
        <Text style={styles.emptyText}>{t('swipe.pausedTitle')}</Text>
        <Text style={styles.subText}>{t('swipe.pausedBody')}</Text>
        <Pressable style={styles.doneButton} onPress={handleSearchMore}>
          <Text style={styles.doneButtonText}>{t('swipe.searchMore')}</Text>
        </Pressable>
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
            <Pressable testID="undo-button" onPress={handleUndo} disabled={undoInFlight} hitSlop={8}>
              <Ionicons
                name="arrow-undo-circle"
                size={28}
                color={colors.textSecondary}
                style={undoInFlight ? styles.disabledIcon : undefined}
              />
            </Pressable>
          )}
        </View>
        <SwipeDeck
          data={candidates}
          renderCard={(asset, isTop) => (
            <PhotoCard
              asset={asset}
              isTop={isTop}
              onLoadError={() => handleCardLoadError(asset)}
              onShare={handleShare}
              screenFocused={screenFocused}
            />
          )}
          onSwipeLeft={handleSwipeLeft}
          onSwipeRight={handleSwipeRight}
          onSkip={handleSkip}
          onEmpty={() => {
            // Can run dry mid-fetch — only "finished" once nothing's left
            // to page in. SwipeDeck resumes on its own once candidates grows.
            if (hasNextPageRef.current || fetchingMoreRef.current) {
              return;
            }
            setFinished(true);
          }}
          leftLabel={t('swipe.deleteLabel')}
          rightLabel={t('swipe.keepLabel')}
          undoSignal={undoSignal}
          skipSignal={skipSignal}
        />
        <View style={styles.hintRow}>
          <Text style={styles.hint}>{t('swipe.deleteHint')}</Text>
          <Pressable testID="skip-button" onPress={handleSkipPress} hitSlop={10}>
            <Text style={[styles.hint, styles.skipHint]}>{t('swipe.skip')}</Text>
          </Pressable>
          <Text style={styles.hint}>{t('swipe.keepHint')}</Text>
        </View>
        {waitingForMore && !finished && (
          <View style={[styles.finishedOverlay, { paddingTop: headerHeight }]}>
            <ActivityIndicator size="large" />
            {scanProgressBar}
          </View>
        )}
        {searchPaused && !finished && !waitingForMore && (
          <View style={[styles.finishedOverlay, { paddingTop: headerHeight }]}>
            <Text style={styles.emptyText}>{t('swipe.pausedTitle')}</Text>
            <Text style={styles.subText}>{t('swipe.pausedBody')}</Text>
            <Pressable style={styles.doneButton} onPress={handleSearchMore}>
              <Text style={styles.doneButtonText}>{t('swipe.searchMore')}</Text>
            </Pressable>
            <Pressable style={styles.undoLastButton} onPress={handleDoneAction}>
              <Text style={styles.undoLastButtonText}>
                {navigation.canGoBack() ? t('swipe.backToCategories') : t('swipe.swipeAgain')}
              </Text>
            </Pressable>
          </View>
        )}
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
              <Pressable
                style={styles.undoLastButton}
                onPress={handleUndo}
                disabled={undoInFlight}
                hitSlop={8}
              >
                <Text style={undoInFlight ? styles.disabledText : styles.undoLastButtonText}>
                  {t('swipe.undoLast')}
                </Text>
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
    scanProgressWrap: { width: '80%', gap: 8, alignItems: 'center' },
    scanProgressTrack: {
      width: '100%',
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.trackInactive,
      overflow: 'hidden',
    },
    scanProgressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 3 },
    scanProgressText: { color: colors.textSecondary, fontSize: 13 },
    emptyText: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
    subText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
    hintRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 24 },
    hint: { color: colors.textSecondary, fontSize: 14 },
    skipHint: { textDecorationLine: 'underline' },
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
    disabledIcon: { opacity: 0.4 },
    disabledText: { color: colors.textSecondary, fontSize: 14, textDecorationLine: 'underline', opacity: 0.4 },
  });
}
