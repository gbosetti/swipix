import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import VideoCard from './VideoCard';
import { Asset } from '../types';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let mockedStatus = 'loading';
const mockedPlayer = { play: jest.fn(), pause: jest.fn(), muted: true, currentTime: 0, playing: false };

jest.mock('expo', () => ({ useEvent: jest.fn((_player, event, initial) => (event === 'statusChange' ? { status: mockedStatus } : initial)) }));
jest.mock('expo-video', () => ({
  VideoView: 'VideoView',
  useVideoPlayer: jest.fn((_uri, configure) => {
    configure?.(mockedPlayer);
    return mockedPlayer;
  }),
}));

function makeAsset(id: string): Asset {
  return {
    id,
    uri: `file:///${id}.mp4`,
    mediaType: 'video',
    creationTime: 0,
    duration: 10,
    width: 100,
    height: 100,
    mediaSubtypes: [],
  };
}

describe('VideoCard', () => {
  beforeEach(() => {
    mockedStatus = 'loading';
    jest.clearAllMocks();
  });

  // Never swipeable on a video the user can't see — a real device report
  // showed a failed video sitting there fully swipeable, letting a user
  // trash or keep something they never actually watched.
  it('calls onLoadError once when the player reports an error status', async () => {
    mockedStatus = 'error';
    const onLoadError = jest.fn();
    render(<VideoCard asset={makeAsset('a')} isTop onLoadError={onLoadError} />);
    await waitFor(() => expect(onLoadError).toHaveBeenCalledTimes(1));
  });

  it('does not call onLoadError while still loading, before the timeout', async () => {
    mockedStatus = 'loading';
    const onLoadError = jest.fn();
    render(<VideoCard asset={makeAsset('a')} isTop onLoadError={onLoadError} />);
    await Promise.resolve();
    expect(onLoadError).not.toHaveBeenCalled();
  });

  it('calls onLoadError after the load timeout when status never resolves (a broken/sandboxed file can stay loading forever without ever emitting an error event)', async () => {
    jest.useFakeTimers();
    mockedStatus = 'loading';
    const onLoadError = jest.fn();
    render(<VideoCard asset={makeAsset('a')} isTop onLoadError={onLoadError} />);
    expect(onLoadError).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(8000);
    expect(onLoadError).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('never calls onLoadError for a video that loads successfully', async () => {
    mockedStatus = 'readyToPlay';
    const onLoadError = jest.fn();
    render(<VideoCard asset={makeAsset('a')} isTop onLoadError={onLoadError} />);
    await Promise.resolve();
    expect(onLoadError).not.toHaveBeenCalled();
  });
});
