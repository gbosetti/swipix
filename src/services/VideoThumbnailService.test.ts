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
    hasListener: () => listener !== null,
    removeSpy: remove,
  };
}

let mockPlayer: ReturnType<typeof makeFakePlayer>;

/**
 * getVideoThumbnail now awaits a concurrency slot before creating the
 * player, adding a microtask hop that wasn't there before — a test that
 * calls `emit(...)` synchronously right after invoking getVideoThumbnail
 * would otherwise fire before the listener is even attached. Awaiting
 * this lets that hop (and the player/listener setup after it) complete
 * first.
 */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

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
    await flushMicrotasks();
    mockPlayer.emit('readyToPlay');

    await expect(promise).resolves.toEqual({ uri: 'thumb://frame0' });
    expect(mockPlayer.release).toHaveBeenCalledTimes(1);
  });

  it('returns null and still releases the player if the player errors out', async () => {
    mockPlayer = makeFakePlayer('loading');
    const promise = getVideoThumbnail('ph://asset-1');
    await flushMicrotasks();
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
    await flushMicrotasks();

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
    await flushMicrotasks();
    mockPlayer.emit('error', new Error('sandbox denied'));
    await expect(firstAttempt).resolves.toBeNull();
    expect(mockedCreateVideoPlayer).toHaveBeenCalledTimes(1);

    const secondAttempt = await getVideoThumbnail('ph://persistently-broken');
    expect(secondAttempt).toBeNull();
    expect(mockedCreateVideoPlayer).toHaveBeenCalledTimes(1);
  });

  // Regression test: confirmed on a real device that a large trash/kept
  // list (after a long deletion session) requests a thumbnail for every
  // video at once with no batching — before this, that meant one real
  // native video player per video, all alive simultaneously, which
  // crashed the app outright (consistent with an OS-level out-of-memory
  // kill: no JS error, ErrorBoundary never even ran).
  it('never has more than THUMBNAIL_CONCURRENCY extractions in flight at once, even when many are requested simultaneously', async () => {
    const CONCURRENCY_LIMIT = 3;
    const REQUEST_COUNT = 10;
    const players = Array.from({ length: REQUEST_COUNT }, () => makeFakePlayer('loading'));
    let created = 0;
    // Tracks the real invariant directly through the mocks, rather than
    // asserting on exact cascade timing (fragile — resolving one
    // extraction takes several microtask hops before the next one's
    // createVideoPlayer call happens, and that hop count isn't a stable
    // thing to assert against).
    let activeNow = 0;
    let maxActive = 0;
    mockedCreateVideoPlayer.mockImplementation(() => {
      activeNow++;
      maxActive = Math.max(maxActive, activeNow);
      const player = players[created++];
      player.release.mockImplementation(() => {
        activeNow--;
      });
      return player;
    });

    const promises = Array.from({ length: REQUEST_COUNT }, (_, i) =>
      getVideoThumbnail(`ph://concurrency-test-${i}`)
    );

    // Repeatedly emit readyToPlay for whichever players have had their
    // listener attached so far, flushing microtasks between passes, until
    // every request has settled — avoids assuming how many ticks each
    // release-then-reassign cascade takes.
    const emitted = new Set<number>();
    for (let pass = 0; pass < 500 && emitted.size < REQUEST_COUNT; pass++) {
      for (let i = 0; i < REQUEST_COUNT; i++) {
        if (!emitted.has(i) && players[i].hasListener()) {
          players[i].emit('readyToPlay');
          emitted.add(i);
        }
      }
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }

    await Promise.all(promises);
    expect(mockedCreateVideoPlayer).toHaveBeenCalledTimes(REQUEST_COUNT);
    expect(maxActive).toBeLessThanOrEqual(CONCURRENCY_LIMIT);
  });
});
