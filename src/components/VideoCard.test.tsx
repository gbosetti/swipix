import React from 'react';
import { render, waitFor, fireEvent, screen } from '@testing-library/react-native';
import VideoCard, { setMutedPreference } from './VideoCard';
import { Asset } from '../types';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let mockedStatus = 'loading';
let mockedIsPlaying = true;
const mockedPlayer = { play: jest.fn(), pause: jest.fn(), muted: true, currentTime: 0, playing: false };

jest.mock('expo', () => ({
  useEvent: jest.fn((_player, event, initial) => {
    if (event === 'statusChange') return { status: mockedStatus };
    if (event === 'playingChange') return { isPlaying: mockedIsPlaying };
    return initial;
  }),
}));
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
    mockedIsPlaying = true;
    setMutedPreference(true);
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

  // Confirmed annoying on a real device: a per-card mute choice reset to
  // muted on every single new video, forcing the user to re-unmute
  // constantly. The choice should carry across the whole session instead.
  it('carries an unmuted choice from one video over to the next one mounted, instead of resetting per card', async () => {
    const first = await render(<VideoCard asset={makeAsset('a')} isTop />);
    fireEvent.press(screen.getByTestId('video-mute-button'));
    await waitFor(() => expect(mockedPlayer.muted).toBe(false));
    await first.unmount();

    // A fresh instance — SwipeDeck mounts a new VideoCard per card, keyed
    // by asset id, so this is what actually happens between videos.
    await render(<VideoCard asset={makeAsset('b')} isTop />);
    expect(mockedPlayer.muted).toBe(false);
  });

  it('shows a resume button while paused, and tapping it plays the video (confirmed on a real device: backgrounding the app or returning from the share sheet could leave a video stuck paused with no way to resume)', async () => {
    mockedIsPlaying = false;
    await render(<VideoCard asset={makeAsset('a')} isTop />);
    // The mount effect (isTop && !failed) already calls play() once on its
    // own — isolate the button's own effect from that.
    mockedPlayer.play.mockClear();

    fireEvent.press(screen.getByTestId('video-play-button'));

    expect(mockedPlayer.play).toHaveBeenCalledTimes(1);
  });

  it('hides the resume button while the video is actually playing', async () => {
    mockedIsPlaying = true;
    await render(<VideoCard asset={makeAsset('a')} isTop />);

    expect(screen.queryByTestId('video-play-button')).toBeNull();
  });
});
