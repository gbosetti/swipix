import { getVideoThumbnail } from './VideoThumbnailService';
import { createVideoPlayer } from 'expo-video';

type StatusListener = (event: { status: string; error?: unknown }) => void;

function makeFakePlayer(initialStatus: string) {
  let listener: StatusListener | null = null;
  const remove = jest.fn();
  return {
    status: initialStatus,
    addListener: jest.fn((_event: string, cb: StatusListener) => {
      listener = cb;
      return { remove };
    }),
    generateThumbnailsAsync: jest.fn().mockResolvedValue([{ uri: 'thumb://frame0' }]),
    release: jest.fn(),
    // Test helper, not part of the real VideoPlayer API — lets a test
    // simulate the native module emitting a status change.
    emit(status: string, error?: unknown) {
      listener?.({ status, error });
    },
    removeSpy: remove,
  };
}

let mockPlayer: ReturnType<typeof makeFakePlayer>;

jest.mock('expo-video', () => ({
  createVideoPlayer: jest.fn(() => mockPlayer),
}));

const mockedCreateVideoPlayer = createVideoPlayer as jest.Mock;

describe('getVideoThumbnail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('resolves the extracted frame once the player reports ready', async () => {
    mockPlayer = makeFakePlayer('loading');
    const promise = getVideoThumbnail('ph://asset-1');
    mockPlayer.emit('readyToPlay');

    await expect(promise).resolves.toEqual({ uri: 'thumb://frame0' });
    expect(mockPlayer.release).toHaveBeenCalledTimes(1);
  });

  it('returns null and still releases the player if the player errors out', async () => {
    mockPlayer = makeFakePlayer('loading');
    const promise = getVideoThumbnail('ph://asset-1');
    mockPlayer.emit('error', new Error('unsupported codec'));

    await expect(promise).resolves.toBeNull();
    expect(mockPlayer.release).toHaveBeenCalledTimes(1);
  });

  // Regression test: confirmed on a real device that a file the OS denies
  // read access to (FIGSANDBOX "deny file-issue-extension" against a
  // WhatsApp-saved video) can leave the player stuck in 'loading' forever
  // — its status never reaches 'readyToPlay' or 'error'. Before the fix,
  // that meant getVideoThumbnail's promise never settled, player.release()
  // never ran, and the underlying player kept retrying the denied read in
  // the background indefinitely.
  it('times out and releases the player if the status never resolves (never-settling native call)', async () => {
    jest.useFakeTimers();
    mockPlayer = makeFakePlayer('loading');
    const promise = getVideoThumbnail('ph://stuck-asset');
    // Never call mockPlayer.emit(...) — simulates a player stuck loading.

    await jest.advanceTimersByTimeAsync(5000);

    await expect(promise).resolves.toBeNull();
    expect(mockPlayer.release).toHaveBeenCalledTimes(1);
  });

  // Regression test: confirmed on a real device across multiple fresh app
  // launches that the same specific video fails this same way every time
  // (a persistent OS-level sandbox denial, not a one-off blip) — and
  // CategoryPickerScreen re-requests a preview for it on every mount,
  // focus regain, and album selection change. Before this, each of those
  // paid the full ~5s timeout again, which was slow enough to make an
  // unrelated interaction (tapping an option in the album picker) feel
  // "ultra slow" and block the app while a doomed retry was in flight.
  it('does not retry a URI that already failed once this session', async () => {
    mockPlayer = makeFakePlayer('loading');
    const firstAttempt = getVideoThumbnail('ph://persistently-broken');
    mockPlayer.emit('error', new Error('sandbox denied'));
    await expect(firstAttempt).resolves.toBeNull();
    expect(mockedCreateVideoPlayer).toHaveBeenCalledTimes(1);

    const secondAttempt = await getVideoThumbnail('ph://persistently-broken');
    expect(secondAttempt).toBeNull();
    expect(mockedCreateVideoPlayer).toHaveBeenCalledTimes(1);
  });
});
