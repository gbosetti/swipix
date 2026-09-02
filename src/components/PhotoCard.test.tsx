import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import PhotoCard from './PhotoCard';
import { Asset } from '../types';
import { ThemeProvider } from '../theme/ThemeContext';

type PhotoCardProps = React.ComponentProps<typeof PhotoCard>;

function renderPhotoCard(props: PhotoCardProps) {
  return render(
    <ThemeProvider>
      <PhotoCard {...props} />
    </ThemeProvider>
  );
}

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('expo', () => ({ useEvent: jest.fn(() => ({})) }));
jest.mock('expo-video', () => ({ VideoView: 'VideoView', useVideoPlayer: jest.fn(() => ({})) }));

/**
 * Renders as a plain host View exposing onLoad/onError as fireable events,
 * so a test can simulate expo-image's real load/error callbacks without a
 * real native image decode. Uses createElement, not JSX — jest.mock
 * factories are hoisted above the file's own imports, which isn't safe
 * for JSX's auto-imported runtime.
 */
jest.mock('expo-image', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports, so this must be require(), not import
  const { createElement } = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  /**
   * useImage normally decodes and returns a native ref once loaded; a stable
   * truthy stand-in is enough here so the <Image> renders and tests can drive
   * its onLoad/onError exactly as before. The real decode-size cap it applies
   * has no observable surface in these tests.
   */
  const fakeImageRef = { __expoImageMockRef: true };
  return {
    Image: (props: Record<string, unknown>) => createElement(View, { testID: 'mock-photo-image', ...props }),
    useImage: () => fakeImageRef,
  };
});

function makeAsset(id: string): Asset {
  return {
    id,
    uri: `ph://${id}`,
    mediaType: 'photo',
    creationTime: 0,
    duration: 0,
    width: 100,
    height: 100,
    mediaSubtypes: [],
  };
}

describe('PhotoCard', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * A photo that decodes within the grace period (the normal case, since
   * SwipeDeck already pre-mounts the next 2 cards) must never flash it.
   */
  it('does not show the retry icon during the initial grace period', async () => {
    jest.useFakeTimers();
    await renderPhotoCard({ asset: makeAsset('a'), isTop: true });
    expect(screen.queryByTestId('photo-retry-button')).toBeNull();
  });

  it('shows the retry icon once the top card has been loading past the grace period', async () => {
    jest.useFakeTimers();
    await renderPhotoCard({ asset: makeAsset('a'), isTop: true });
    await act(async () => { await jest.advanceTimersByTimeAsync(400); });
    expect(screen.getByTestId('photo-retry-button')).toBeTruthy();
  });

  it('hides the retry icon once the image loads', async () => {
    jest.useFakeTimers();
    await renderPhotoCard({ asset: makeAsset('a'), isTop: true });
    await act(async () => { await jest.advanceTimersByTimeAsync(400); });
    expect(screen.getByTestId('photo-retry-button')).toBeTruthy();
    await fireEvent(screen.getByTestId('mock-photo-image'), 'load');
    expect(screen.queryByTestId('photo-retry-button')).toBeNull();
  });

  /**
   * Never shown on a background card — SwipeDeck only lets the top card
   * be interacted with, so a retry button on a card behind it would be
   * confusing and unreachable.
   */
  it('never shows the retry icon on a non-top card', async () => {
    jest.useFakeTimers();
    await renderPhotoCard({ asset: makeAsset('a'), isTop: false });
    await act(async () => { await jest.advanceTimersByTimeAsync(400); });
    expect(screen.queryByTestId('photo-retry-button')).toBeNull();
  });

  it('calls onLoadError once the load timeout elapses without load or error firing', async () => {
    jest.useFakeTimers();
    const onLoadError = jest.fn();
    await renderPhotoCard({ asset: makeAsset('a'), isTop: true, onLoadError });
    expect(onLoadError).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(8000);
    expect(onLoadError).toHaveBeenCalledTimes(1);
  });

  it('never calls onLoadError for a photo that loads successfully', async () => {
    jest.useFakeTimers();
    const onLoadError = jest.fn();
    await renderPhotoCard({ asset: makeAsset('a'), isTop: true, onLoadError });
    await fireEvent(screen.getByTestId('mock-photo-image'), 'load');

    await jest.advanceTimersByTimeAsync(8000);
    expect(onLoadError).not.toHaveBeenCalled();
  });

  /**
   * Pressing retry should give a slow-but-real load a genuinely fresh
   * chance, not just reset the visible icon while quietly still counting
   * down toward the original timeout.
   */
  it('pressing retry resets the load timeout instead of letting the original one still fire', async () => {
    jest.useFakeTimers();
    const onLoadError = jest.fn();
    await renderPhotoCard({ asset: makeAsset('a'), isTop: true, onLoadError });

    await act(async () => { await jest.advanceTimersByTimeAsync(6000); });
    await fireEvent.press(screen.getByTestId('photo-retry-button'));
    await jest.advanceTimersByTimeAsync(6000);
    expect(onLoadError).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(2000);
    expect(onLoadError).toHaveBeenCalledTimes(1);
  });

  it('keeps showing the retry icon after pressing it, until the retried load resolves', async () => {
    jest.useFakeTimers();
    await renderPhotoCard({ asset: makeAsset('a'), isTop: true });
    await act(async () => { await jest.advanceTimersByTimeAsync(400); });
    await fireEvent.press(screen.getByTestId('photo-retry-button'));
    expect(screen.getByTestId('photo-retry-button')).toBeTruthy();

    await fireEvent(screen.getByTestId('mock-photo-image'), 'load');
    expect(screen.queryByTestId('photo-retry-button')).toBeNull();
  });
});
