import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import SwipeScreen from './SwipeScreen';
import { ThemeProvider } from '../theme/ThemeContext';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { TrashService } from '../services/TrashService';

/**
 * A minimal stand-in for the real SwipeDeck — swaps out its native
 * gesture-driven swiping (react-native-gesture-handler, not practical to
 * simulate in Jest) for a plain pressable trigger, so the Undo-guard
 * regression test below can build up swipe history without needing a
 * real drag gesture.
 */
jest.mock('../components/SwipeDeck', () => {
  /**
   * jest.mock factories can't reference out-of-scope imports, so these
   * must be required inline rather than imported at module top.
   */
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactActual = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View, Pressable } = require('react-native');
  return function MockSwipeDeck(props: {
    data: { id: string }[];
    onSwipeLeft?: (item: { id: string }) => void;
  }) {
    const top = props.data[0];
    if (!top) {
      return null;
    }
    return ReactActual.createElement(
      View,
      null,
      ReactActual.createElement(Pressable, {
        testID: 'swipe-left',
        onPress: () => props.onSwipeLeft?.(top),
      })
    );
  };
});

/**
 * A render crash here (hook misuse, undefined access, a missing provider
 * a real screen depends on) is exactly the class of bug unit tests on
 * strategies/services can't catch — several shipped this way this week
 * because nothing ever actually mounted the screen.
 */
jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 0 }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
/**
 * PhotoCard pulls in VideoCard for the video-asset branch, which needs
 * expo-video's native module — unavailable under Jest regardless of
 * whether a test actually renders a video card.
 */
jest.mock('expo', () => ({ ...jest.requireActual('expo'), useEvent: jest.fn(() => ({})) }));
jest.mock('expo-video', () => ({ VideoView: 'VideoView', useVideoPlayer: jest.fn(() => ({})) }));

jest.mock('../services/PhotoLibraryService', () => ({
  PhotoLibraryService: {
    requestPermission: jest.fn(),
    getMediaPage: jest.fn(),
  },
}));
jest.mock('../services/TrashService', () => ({
  TrashService: {
    getTrash: jest.fn().mockResolvedValue([]),
    moveToTrash: jest.fn().mockResolvedValue(undefined),
    restore: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../services/KeptService', () => ({
  KeptService: {
    getKept: jest.fn().mockResolvedValue([]),
    isKept: jest.fn().mockResolvedValue(false),
    addKept: jest.fn().mockResolvedValue(undefined),
    removeKept: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockedPhotoLibraryService = PhotoLibraryService as jest.Mocked<typeof PhotoLibraryService>;
const mockedTrashService = TrashService as jest.Mocked<typeof TrashService>;

function makeAsset(id: string) {
  return {
    id,
    uri: `file:///${id}.jpg`,
    mediaType: 'photo' as const,
    creationTime: 0,
    duration: 0,
    width: 100,
    height: 100,
    mediaSubtypes: [],
  };
}

function renderSwipeScreen(strategyId = 'random') {
  const navigation = { canGoBack: () => false, goBack: jest.fn(), navigate: jest.fn() };
  const route = { key: 'Swipe', name: 'Swipe' as const, params: { strategyId } };
  return render(
    <NavigationContainer>
      <ThemeProvider>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <SwipeScreen route={route as any} navigation={navigation as any} />
      </ThemeProvider>
    </NavigationContainer>
  );
}

describe('SwipeScreen', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('renders without crashing and falls through to the empty state when nothing matches', async () => {
    mockedPhotoLibraryService.requestPermission.mockResolvedValue(true);
    mockedPhotoLibraryService.getMediaPage.mockResolvedValue({
      assets: [],
      endCursor: '',
      hasNextPage: false,
      rawCount: 0,
    });

    await renderSwipeScreen();

    await waitFor(() => expect(screen.getByText('swipe.emptyTitle')).toBeTruthy());
  });

  it('renders without crashing and shows the permission-denied state when access is off', async () => {
    mockedPhotoLibraryService.requestPermission.mockResolvedValue(false);

    await renderSwipeScreen();

    await waitFor(() => expect(screen.getByText('swipe.permissionDeniedTitle')).toBeTruthy());
  });

  it('shows a "search more" prompt instead of falsely claiming empty when the retry budget runs out but the library is not exhausted (regression: a category with real matches deep in a large library — e.g. "By Month" for an older month — showed "Nothing to review here" immediately after a single search cycle, even though the exact same month\'s native-date-filtered category preview correctly found a match)', async () => {
    mockedPhotoLibraryService.requestPermission.mockResolvedValue(true);
    mockedPhotoLibraryService.getMediaPage.mockResolvedValue({
      assets: [],
      endCursor: '',
      hasNextPage: true,
      rawCount: 0,
    });

    await renderSwipeScreen();

    await waitFor(() => expect(screen.getByText('swipe.pausedTitle')).toBeTruthy(), { timeout: 10000 });
    expect(screen.queryByText('swipe.emptyTitle')).toBeNull();
    expect(screen.getByText('swipe.searchMore')).toBeTruthy();
  }, 15000);

  it('keeps searching across multiple cycles and stops once it finds a match that only turns up deep in the library, instead of giving up after one cycle', async () => {
    const asset = {
      id: 'deep-match',
      uri: 'file:///deep-match.jpg',
      mediaType: 'photo' as const,
      creationTime: 0,
      duration: 0,
      width: 100,
      height: 100,
      mediaSubtypes: [],
    };
    let callCount = 0;
    mockedPhotoLibraryService.requestPermission.mockResolvedValue(true);
    mockedPhotoLibraryService.getMediaPage.mockImplementation(async () => {
      callCount += 1;
      /**
       * First 11 calls (a full retry cycle's worth of page attempts, plus
       * one more) find nothing; only after that does a match appear —
       * simulates a match that only exists well past the first cycle's
       * newest-first search window. Asserting on the call count directly
       * (rather than rendered deck content) keeps this test independent
       * of SwipeDeck's own render behavior under Jest.
       */
      if (callCount <= 11) {
        return { assets: [], endCursor: '', hasNextPage: true, rawCount: 0 };
      }
      return { assets: [asset], endCursor: '', hasNextPage: true, rawCount: 1 };
    });

    await renderSwipeScreen();

    await waitFor(() => expect(callCount).toBeGreaterThan(11), { timeout: 10000 });
    const countRightAfterMatch = callCount;
    /**
     * The retry loop should stop calling getMediaPage once a match is
     * found — give it a moment, then confirm the count settled instead
     * of continuing to climb.
     */
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(callCount).toBe(countRightAfterMatch);
  }, 15000);

  it('ignores a second Undo tap while the first is still in flight, instead of undoing the same item twice and silently skipping another (regression: could otherwise leave a photo recorded in Trash while also reappearing as swipeable again — if then swiped the other way, it would end up in both Trash and Kept, and a later "Empty Trash Now" would permanently delete a photo the user had just chosen to keep)', async () => {
    const asset = makeAsset('a1');
    mockedPhotoLibraryService.requestPermission.mockResolvedValue(true);
    mockedPhotoLibraryService.getMediaPage.mockResolvedValue({
      assets: [asset],
      endCursor: '',
      hasNextPage: false,
      rawCount: 1,
    });

    let resolveRestore: () => void = () => {};
    const restorePromise = new Promise<void>((resolve) => {
      resolveRestore = resolve;
    });
    mockedTrashService.restore.mockReturnValue(restorePromise);

    await renderSwipeScreen();

    await waitFor(() => expect(screen.getByTestId('swipe-left')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('swipe-left'));
    await waitFor(() => expect(mockedTrashService.moveToTrash).toHaveBeenCalledWith(asset));

    const undoButton = await screen.findByTestId('undo-button');
    /**
     * Deliberately NOT awaited: handleUndo suspends on the unresolved
     * restore promise below, so awaiting the tap would hang.
     */
    fireEvent.press(undoButton);
    /**
     * TrashService.restore is now in flight (its promise is deliberately
     * unresolved) — a second, overlapping tap here is exactly the race
     * this guard exists to close.
     */
    fireEvent.press(undoButton);

    /**
     * Resolving inside act() so handleUndo's post-await state updates
     * (setFreedCount/setFinished/setUndoSignal/…) land inside an act scope
     * instead of escaping it after the test moves on.
     */
    await act(async () => {
      resolveRestore();
      await restorePromise;
    });
    await waitFor(() => expect(mockedTrashService.restore).toHaveBeenCalledTimes(1));
    /**
     * Give an incorrect second call a moment to have fired too, if the
     * guard didn't actually block it.
     */
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockedTrashService.restore).toHaveBeenCalledTimes(1);
  });

});
