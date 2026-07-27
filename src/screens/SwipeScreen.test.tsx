import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import SwipeScreen from './SwipeScreen';
import { ThemeProvider } from '../theme/ThemeContext';
import { PhotoLibraryService } from '../services/PhotoLibraryService';

// A render crash here (hook misuse, undefined access, a missing provider
// a real screen depends on) is exactly the class of bug unit tests on
// strategies/services can't catch — several shipped this way this week
// because nothing ever actually mounted the screen.
jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 0 }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
// PhotoCard pulls in VideoCard for the video-asset branch, which needs
// expo-video's native module — unavailable under Jest regardless of
// whether a test actually renders a video card.
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
  beforeEach(() => jest.clearAllMocks());

  it('renders without crashing and falls through to the empty state when nothing matches', async () => {
    mockedPhotoLibraryService.requestPermission.mockResolvedValue(true);
    mockedPhotoLibraryService.getMediaPage.mockResolvedValue({
      assets: [],
      endCursor: '',
      hasNextPage: false,
    });

    renderSwipeScreen();

    await waitFor(() => expect(screen.getByText('swipe.emptyTitle')).toBeTruthy());
  });

  it('renders without crashing and shows the permission-denied state when access is off', async () => {
    mockedPhotoLibraryService.requestPermission.mockResolvedValue(false);

    renderSwipeScreen();

    await waitFor(() => expect(screen.getByText('swipe.permissionDeniedTitle')).toBeTruthy());
  });
});
