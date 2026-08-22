import * as MediaLibrary from 'expo-media-library';
import { Linking, Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { PhotoLibraryService } from './PhotoLibraryService';

jest.mock('expo-media-library', () => ({
  getAssetsAsync: jest.fn(),
  getAssetInfoAsync: jest.fn(),
  getAlbumsAsync: jest.fn(),
  SortBy: { creationTime: 'creationTime' },
}));

jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn() }));

const mockedGetAssetsAsync = MediaLibrary.getAssetsAsync as jest.Mock;
const mockedGetAssetInfoAsync = MediaLibrary.getAssetInfoAsync as jest.Mock;
const mockedGetInfoAsync = FileSystem.getInfoAsync as jest.Mock;
const mockedGetAlbumsAsync = MediaLibrary.getAlbumsAsync as jest.Mock;

function rawAsset(id: string, mediaType: 'photo' | 'video' = 'photo', creationTime = 1000) {
  return {
    id,
    uri: `ph://${id}`,
    mediaType,
    creationTime,
    duration: 0,
    width: 100,
    height: 100,
  };
}

describe('PhotoLibraryService.getMediaPage', () => {
  beforeEach(() => jest.clearAllMocks());
  // A failed assertion inside a fake-timers test would otherwise skip its
  // own jest.useRealTimers() call, leaving fake timers stuck for every
  // later test in the file (confirmed: this exact thing cascaded into 24
  // unrelated failures elsewhere once one test's premise went stale).
  afterEach(() => jest.useRealTimers());

  it('passes the cursor through to getAssetsAsync and returns endCursor/hasNextPage', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('a')],
      endCursor: 'cursor-2',
      hasNextPage: true,
      totalCount: 100,
    });

    const page = await PhotoLibraryService.getMediaPage({
      mediaTypes: ['photo'],
      first: 60,
      after: 'cursor-1',
    });

    expect(mockedGetAssetsAsync).toHaveBeenCalledWith(
      expect.objectContaining({ first: 60, after: 'cursor-1', mediaType: 'photo' })
    );
    expect(page.endCursor).toBe('cursor-2');
    expect(page.hasNextPage).toBe(true);
    expect(page.assets.map((a) => a.id)).toEqual(['a']);
  });

  it('returns the raw ph:// uri for photos without calling getAssetInfoAsync', async () => {
    // The live-browsing fast path: resolving every page's photos' real file
    // paths up front was confirmed on a real device to serialize on iOS's
    // main thread and stall the first Swipe card by 7-10s. expo-image
    // renders ph:// directly, so this path skips that resolution entirely.
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('a')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 1,
    });

    const page = await PhotoLibraryService.getMediaPage({ mediaTypes: ['photo'], first: 60 });

    expect(mockedGetAssetInfoAsync).not.toHaveBeenCalled();
    expect(page.assets).toEqual([expect.objectContaining({ id: 'a', uri: 'ph://a' })]);
  });

  it('returns the raw ph:// uri for videos too, without calling getAssetInfoAsync (regression: getAssetInfoAsync\'s localUri is a known expo-media-library/expo-video incompatibility — iOS denies mediaserverd read access to it for many ordinary videos, confirmed on a real device)', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('v1', 'video')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 1,
    });

    const page = await PhotoLibraryService.getMediaPage({ mediaTypes: ['video'], first: 60 });

    expect(mockedGetAssetInfoAsync).not.toHaveBeenCalled();
    expect(page.assets).toEqual([expect.objectContaining({ id: 'v1', uri: 'ph://v1' })]);
    expect(page.assets[0].localUri).toBeUndefined();
  });

  it('resolves a video through getAssetInfoAsync only when detailed is requested, keeping uri as the ph:// reference and carrying the resolved path separately as localUri', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('v1', 'video')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 1,
    });
    mockedGetAssetInfoAsync.mockResolvedValue({ localUri: 'file:///v1.mov', mediaSubtypes: [] });

    const page = await PhotoLibraryService.getMediaPage({
      mediaTypes: ['video'],
      first: 60,
      detailed: true,
    });

    expect(mockedGetAssetInfoAsync).toHaveBeenCalledTimes(1);
    expect(page.assets).toEqual([
      expect.objectContaining({ id: 'v1', uri: 'ph://v1', localUri: 'file:///v1.mov' }),
    ]);
  });

  it('omits a detailed video fetch\'s assets with no resolvable localUri rather than including an unusable reference', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('good', 'video'), rawAsset('missing', 'video')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 2,
    });
    mockedGetAssetInfoAsync.mockImplementation(async (asset: { id: string }) =>
      asset.id === 'good' ? { localUri: 'file:///good.mov', mediaSubtypes: [] } : { localUri: null }
    );

    const page = await PhotoLibraryService.getMediaPage({
      mediaTypes: ['video'],
      first: 60,
      detailed: true,
    });

    expect(page.assets.map((a) => a.id)).toEqual(['good']);
    expect(page.hasNextPage).toBe(false);
  });

  it('passes a multi-type mediaTypes array through un-collapsed', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('a')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 1,
    });

    await PhotoLibraryService.getMediaPage({ mediaTypes: ['photo', 'video'], first: 60 });

    expect(mockedGetAssetsAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: ['photo', 'video'] })
    );
  });

  it('skips a video whose getAssetInfoAsync call rejects instead of failing the whole page (regression: a single bad asset in a real, large library used to silently break every category preview, since nothing caught the rejection)', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('good', 'video'), rawAsset('bad', 'video')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 2,
    });
    mockedGetAssetInfoAsync.mockImplementation(async (asset: { id: string }) => {
      if (asset.id === 'bad') {
        throw new Error('native failure');
      }
      return { localUri: 'file:///good.mov', mediaSubtypes: [] };
    });

    const page = await PhotoLibraryService.getMediaPage({
      mediaTypes: ['video'],
      first: 60,
      detailed: true,
    });

    expect(page.assets.map((a) => a.id)).toEqual(['good']);
  });

  it('reports onProgress as each item in a detailed fetch resolves, with a fixed total known up front', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('v1', 'video'), rawAsset('v2', 'video'), rawAsset('v3', 'video')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 3,
    });
    mockedGetAssetInfoAsync.mockResolvedValue({ localUri: 'file:///v.mov', mediaSubtypes: [] });
    const onProgress = jest.fn();

    await PhotoLibraryService.getMediaPage({
      mediaTypes: ['video'],
      first: 60,
      detailed: true,
      onProgress,
    });

    // 4, not 3: an immediate (0, total) fires before any item starts, so
    // the progress bar has something to show even while every item is
    // still queued for a concurrency slot.
    expect(onProgress).toHaveBeenCalledTimes(4);
    expect(onProgress).toHaveBeenNthCalledWith(1, 0, 3);
    // total is fixed at 3 on every call; done increases monotonically.
    for (const [done, total] of onProgress.mock.calls) {
      expect(total).toBe(3);
      expect(done).toBeGreaterThanOrEqual(0);
      expect(done).toBeLessThanOrEqual(3);
    }
  });

  it('negative-caches an asset whose getAssetInfoAsync call fails, skipping it entirely on a later fetch instead of retrying the same doomed native call again', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('persistently-bad', 'video')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 1,
    });
    mockedGetAssetInfoAsync.mockRejectedValue(new Error('sandbox denied'));

    const firstPage = await PhotoLibraryService.getMediaPage({
      mediaTypes: ['video'],
      first: 1,
      detailed: true,
    });
    expect(firstPage.assets).toEqual([]);
    expect(mockedGetAssetInfoAsync).toHaveBeenCalledTimes(1);

    mockedGetAssetInfoAsync.mockClear();
    const secondPage = await PhotoLibraryService.getMediaPage({
      mediaTypes: ['video'],
      first: 1,
      detailed: true,
    });
    expect(secondPage.assets).toEqual([]);
    expect(mockedGetAssetInfoAsync).not.toHaveBeenCalled();
  });

  it('times out and negative-caches an asset whose getAssetInfoAsync call never settles (confirmed on a real device: a sandbox-denied read can retry internally without ever rejecting)', async () => {
    jest.useFakeTimers();
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('stuck-forever', 'video')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 1,
    });
    mockedGetAssetInfoAsync.mockReturnValue(new Promise(() => {}));

    const pagePromise = PhotoLibraryService.getMediaPage({
      mediaTypes: ['video'],
      first: 1,
      detailed: true,
    });
    await jest.advanceTimersByTimeAsync(4000);
    const page = await pagePromise;

    expect(page.assets).toEqual([]);
    jest.useRealTimers();
  });
});

describe('PhotoLibraryService.getAllPhotos / getAllMedia (detailed fetch)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves photos through getAssetInfoAsync too, for callers that need a real file path', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('good'), rawAsset('missing')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 2,
    });
    mockedGetAssetInfoAsync.mockImplementation(async (asset: { id: string }) =>
      asset.id === 'good' ? { localUri: 'file:///good.jpg', mediaSubtypes: [] } : { localUri: null }
    );

    const assets = await PhotoLibraryService.getAllPhotos();

    expect(mockedGetAssetInfoAsync).toHaveBeenCalledTimes(2);
    expect(assets.map((a) => a.id)).toEqual(['good']);
  });
});

describe('PhotoLibraryService detailed fetch on Android', () => {
  const originalOS = Platform.OS;
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'android';
  });
  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('skips getAssetInfoAsync entirely even when detailed is requested, returning each asset\'s already-resolved uri (regression: Big Pictures/Big Videos found nothing on every Android device — getAssetInfoAsync rejects there without ACCESS_MEDIA_LOCATION, a permission deliberately never requested for privacy, and Android already exposes the real file:// path as uri so the detailed call is redundant anyway)', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('a'), rawAsset('b')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 2,
    });

    const page = await PhotoLibraryService.getMediaPage({
      mediaTypes: ['photo'],
      first: 60,
      detailed: true,
    });

    expect(mockedGetAssetInfoAsync).not.toHaveBeenCalled();
    expect(page.assets.map((a) => a.id)).toEqual(['a', 'b']);
    // Nothing is dropped, so rawCount matches the returned count — the
    // caller's growing-window pagination keeps advancing instead of
    // stalling on a page that "resolved" zero usable assets.
    expect(page.rawCount).toBe(2);
  });
});

describe('PhotoLibraryService native-call concurrency', () => {
  beforeEach(() => jest.clearAllMocks());

  it('caps concurrent getAssetInfoAsync calls globally, across two simultaneous detailed fetches, not per-fetch (regression: on a real device, several categories loading detailed previews at once — Big Pictures, Big Videos, Duplicates & Similar — each ran their own full-width concurrency batch, so the real combined total on iOS\'s main thread was several times the intended limit, stalling even unrelated categories past their own timeouts)', async () => {
    let active = 0;
    let peak = 0;
    mockedGetAssetInfoAsync.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { localUri: 'file:///a.jpg', mediaSubtypes: [] };
    });

    // Two distinct fetches (different `first`, so different cache keys —
    // not coalesced by the single-flight cache), each larger than the
    // concurrency cap on its own, started together.
    mockedGetAssetsAsync
      .mockResolvedValueOnce({
        assets: Array.from({ length: 25 }, (_, i) => rawAsset(`a${i}`)),
        endCursor: 'a',
        hasNextPage: false,
        totalCount: 25,
      })
      .mockResolvedValueOnce({
        assets: Array.from({ length: 25 }, (_, i) => rawAsset(`b${i}`)),
        endCursor: 'b',
        hasNextPage: false,
        totalCount: 25,
      });

    await Promise.all([
      PhotoLibraryService.getAllPhotos({ first: 25 }),
      PhotoLibraryService.getAllMedia({ first: 25 }),
    ]);

    expect(peak).toBeLessThanOrEqual(8);
  });

  it('lets a high-priority request jump ahead of already-queued low-priority ones once the cap is saturated', async () => {
    let resolveGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveGate = resolve;
    });
    const callOrder: string[] = [];
    mockedGetAssetInfoAsync.mockImplementation(async (asset: { id: string }) => {
      if (asset.id.startsWith('filler')) {
        // Holds its slot open until the gate releases, so every filler
        // call is guaranteed active (not just dispatched) when the
        // low/high requests below are issued.
        await gate;
      } else {
        callOrder.push(asset.id);
      }
      return { localUri: 'file:///a.jpg', mediaSubtypes: [] };
    });

    // Saturates the (now much smaller) concurrency cap so anything else
    // has to wait in the queue.
    mockedGetAssetsAsync.mockResolvedValueOnce({
      assets: Array.from({ length: 8 }, (_, i) => rawAsset(`filler${i}`)),
      endCursor: 'a',
      hasNextPage: false,
      totalCount: 8,
    });
    const fillerPromise = PhotoLibraryService.getAllPhotos({ first: 8 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    mockedGetAssetsAsync
      .mockResolvedValueOnce({
        assets: [rawAsset('low')],
        endCursor: 'b',
        hasNextPage: false,
        totalCount: 1,
      })
      .mockResolvedValueOnce({
        assets: [rawAsset('high')],
        endCursor: 'c',
        hasNextPage: false,
        totalCount: 1,
      });
    // Different `first` values so these two don't collide in the
    // single-flight in-flight cache (keyed on the fetch params) — each
    // needs to make its own real call for the priority ordering below to
    // mean anything.
    const lowPromise = PhotoLibraryService.getAllPhotos({ first: 1 });
    const highPromise = PhotoLibraryService.getAllPhotos({ first: 2, priority: 'high' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    resolveGate();
    await Promise.all([fillerPromise, lowPromise, highPromise]);

    expect(callOrder).toEqual(['high', 'low']);
  });

  it('skips an item that has not started its own native call once isCancelled becomes true, instead of occupying a slot for an abandoned session (regression: leaving a slow scan mid-flight could hold the whole concurrency pool hostage until its abandoned page fully drained, starving a freshly-opened swipe session even with high priority)', async () => {
    let resolveGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveGate = resolve;
    });
    let cancelled = false;
    const infoCalls: string[] = [];
    mockedGetAssetInfoAsync.mockImplementation(async (asset: { id: string }) => {
      infoCalls.push(asset.id);
      if (asset.id.startsWith('filler')) {
        await gate;
      }
      return { localUri: 'file:///a.jpg', mediaSubtypes: [] };
    });

    // Saturates the cap with 8 filler items that hold their slots open.
    mockedGetAssetsAsync.mockResolvedValueOnce({
      assets: Array.from({ length: 8 }, (_, i) => rawAsset(`filler${i}`, 'video')),
      endCursor: 'a',
      hasNextPage: false,
      totalCount: 8,
    });
    const fillerPromise = PhotoLibraryService.getMediaPage({
      mediaTypes: ['video'],
      first: 8,
      detailed: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Queued behind the saturated cap — never gets a chance to dispatch
    // its own native call before the caller abandons it.
    mockedGetAssetsAsync.mockResolvedValueOnce({
      assets: [rawAsset('queued', 'video')],
      endCursor: 'b',
      hasNextPage: false,
      totalCount: 1,
    });
    const queuedPromise = PhotoLibraryService.getMediaPage({
      mediaTypes: ['video'],
      first: 1,
      detailed: true,
      isCancelled: () => cancelled,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    cancelled = true;
    resolveGate();
    const [, queuedPage] = await Promise.all([fillerPromise, queuedPromise]);

    expect(queuedPage.assets).toEqual([]);
    expect(infoCalls).not.toContain('queued');
  });
});

describe('PhotoLibraryService.getSplitMediaPage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('splits one combined fetch into photos and videos', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('p1', 'photo'), rawAsset('v1', 'video'), rawAsset('p2', 'photo')],
      endCursor: 'cursor-2',
      hasNextPage: true,
      totalCount: 3,
    });
    mockedGetAssetInfoAsync.mockResolvedValue({ localUri: 'file:///a.jpg', mediaSubtypes: [] });

    const page = await PhotoLibraryService.getSplitMediaPage({ first: 150 });

    expect(mockedGetAssetsAsync).toHaveBeenCalledTimes(1);
    expect(mockedGetAssetsAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: ['photo', 'video'] })
    );
    expect(page.photos.map((a) => a.id)).toEqual(['p1', 'p2']);
    expect(page.videos.map((a) => a.id)).toEqual(['v1']);
    expect(page.endCursor).toBe('cursor-2');
    expect(page.hasNextPage).toBe(true);
  });
});

describe('PhotoLibraryService.getShareableUri', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.useRealTimers());

  it('resolves a real local path by asset id, regardless of what uri a swipe session already carries', async () => {
    mockedGetAssetInfoAsync.mockResolvedValue({ localUri: 'file:///v1.mov', mediaSubtypes: [] });

    const uri = await PhotoLibraryService.getShareableUri('v1');

    expect(mockedGetAssetInfoAsync).toHaveBeenCalledWith('v1');
    expect(uri).toBe('file:///v1.mov');
  });

  it('resolves to null rather than throwing when the asset has no resolvable local path', async () => {
    mockedGetAssetInfoAsync.mockResolvedValue({ localUri: null });

    const uri = await PhotoLibraryService.getShareableUri('missing');

    expect(uri).toBeNull();
  });

  it('resolves to null rather than throwing when getAssetInfoAsync rejects', async () => {
    mockedGetAssetInfoAsync.mockRejectedValue(new Error('native failure'));

    const uri = await PhotoLibraryService.getShareableUri('bad');

    expect(uri).toBeNull();
  });

  it('resolves to null rather than hanging forever when getAssetInfoAsync never settles', async () => {
    jest.useFakeTimers();
    mockedGetAssetInfoAsync.mockReturnValue(new Promise(() => {}));

    const uriPromise = PhotoLibraryService.getShareableUri('stuck');
    await jest.advanceTimersByTimeAsync(4000);

    expect(await uriPromise).toBeNull();
  });
});

describe('PhotoLibraryService request coalescing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('coalesces concurrent identical requests into a single getAssetsAsync call', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('a')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 1,
    });
    mockedGetAssetInfoAsync.mockResolvedValue({ localUri: 'file:///a.jpg', mediaSubtypes: [] });

    // Multiple "self-fetching" strategies calling getAllMedia() nearly
    // simultaneously — the scenario this de-dupe exists for.
    const [a, b, c] = await Promise.all([
      PhotoLibraryService.getAllMedia(),
      PhotoLibraryService.getAllMedia(),
      PhotoLibraryService.getAllMedia(),
    ]);

    expect(mockedGetAssetsAsync).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it('does not coalesce requests with different params', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('a')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 1,
    });
    mockedGetAssetInfoAsync.mockResolvedValue({ localUri: 'file:///a.jpg', mediaSubtypes: [] });

    await Promise.all([PhotoLibraryService.getAllPhotos(), PhotoLibraryService.getAllMedia()]);

    expect(mockedGetAssetsAsync).toHaveBeenCalledTimes(2);
  });

  it('fetches fresh data again on a later, separate call once the first has settled', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('a')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 1,
    });
    mockedGetAssetInfoAsync.mockResolvedValue({ localUri: 'file:///a.jpg', mediaSubtypes: [] });

    await PhotoLibraryService.getAllMedia();
    await PhotoLibraryService.getAllMedia();

    expect(mockedGetAssetsAsync).toHaveBeenCalledTimes(2);
  });
});

describe('PhotoLibraryService.getPreviewCandidates', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes mediaSubtypes and a date range through to getAssetsAsync as native filters', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('a')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 1,
    });

    const createdAfter = new Date(2026, 0, 1);
    const createdBefore = new Date(2026, 1, 1);
    await PhotoLibraryService.getPreviewCandidates({
      mediaTypes: ['photo'],
      mediaSubtypes: ['screenshot'],
      createdAfter,
      createdBefore,
      first: 5,
    });

    expect(mockedGetAssetsAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        first: 5,
        mediaSubtypes: ['screenshot'],
        createdAfter,
        createdBefore,
      })
    );
    expect(mockedGetAssetInfoAsync).not.toHaveBeenCalled();
  });

  it('defaults to 5 candidates and the fast (non-detailed) path', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('a')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 1,
    });

    const candidates = await PhotoLibraryService.getPreviewCandidates({ mediaTypes: ['photo'] });

    expect(mockedGetAssetsAsync).toHaveBeenCalledWith(expect.objectContaining({ first: 5 }));
    expect(candidates[0].uri).toBe('ph://a');
  });

  it('resolves a real file path when detailed is requested (Big Pictures/Videos need real file size)', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('a')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 1,
    });
    mockedGetAssetInfoAsync.mockResolvedValue({ localUri: 'file:///a.jpg', mediaSubtypes: [] });

    const candidates = await PhotoLibraryService.getPreviewCandidates({
      mediaTypes: ['photo'],
      detailed: true,
    });

    expect(mockedGetAssetInfoAsync).toHaveBeenCalled();
    expect(candidates[0].uri).toBe('file:///a.jpg');
  });
});

describe('PhotoLibraryService cache eviction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('the page-level native call times out and evicts itself from the fetch cache, so a later identical request gets a fresh fetch instead of hanging on the same dead promise forever (regression: a real device report — thumbnails loaded once, then never again, even after restarting the app)', async () => {
    // First call's underlying native fetch never resolves.
    mockedGetAssetsAsync.mockReturnValueOnce(new Promise(() => {}));
    const stuckPromise = PhotoLibraryService.getPreviewCandidates({ mediaTypes: ['photo'] });
    const rejection = expect(stuckPromise).rejects.toThrow('Native call timed out');
    // Bounded by the page-fetch timeout itself now, not the (much longer)
    // cache-eviction window — the underlying call settles on its own.
    await jest.advanceTimersByTimeAsync(8000);
    await rejection;

    // A later, identical request should get a fresh fetch, not reuse the
    // same now-settled (rejected) promise.
    mockedGetAssetsAsync.mockResolvedValueOnce({
      assets: [rawAsset('a')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 1,
    });
    const recovered = await PhotoLibraryService.getPreviewCandidates({ mediaTypes: ['photo'] });

    expect(recovered.map((a) => a.id)).toEqual(['a']);
    expect(mockedGetAssetsAsync).toHaveBeenCalledTimes(2);
  });
});

describe('PhotoLibraryService.getAlbums', () => {
  beforeEach(() => jest.clearAllMocks());

  it('excludes moments and smart albums, keeping only real user-created albums', async () => {
    mockedGetAlbumsAsync.mockResolvedValue([
      { id: '1', title: 'Vacation', assetCount: 10, type: 'album' },
      { id: '2', title: 'Today', assetCount: 5, type: 'moment' },
      { id: '3', title: 'Favorites', assetCount: 3, type: 'smartAlbum' },
    ]);
    mockedGetAssetsAsync.mockResolvedValue({ assets: [], endCursor: '', hasNextPage: false, totalCount: 10 });

    const albums = await PhotoLibraryService.getAlbums('photo');

    expect(albums.map((a) => a.id)).toEqual(['1']);
    expect(mockedGetAlbumsAsync).toHaveBeenCalledWith({ includeSmartAlbums: false });
  });

  it('sorts albums by title for a stable, predictable picker order', async () => {
    mockedGetAlbumsAsync.mockResolvedValue([
      { id: '1', title: 'Zoo', assetCount: 1, type: 'album' },
      { id: '2', title: 'Animals', assetCount: 1, type: 'album' },
    ]);
    mockedGetAssetsAsync.mockResolvedValue({ assets: [], endCursor: '', hasNextPage: false, totalCount: 1 });

    const albums = await PhotoLibraryService.getAlbums('photo');

    expect(albums.map((a) => a.title)).toEqual(['Animals', 'Zoo']);
  });

  it('excludes empty albums — nothing to swipe, so the picker should never offer a dead end', async () => {
    mockedGetAlbumsAsync.mockResolvedValue([
      { id: '1', title: 'Has Photos', assetCount: 5, type: 'album' },
      { id: '2', title: 'Empty', assetCount: 0, type: 'album' },
    ]);
    mockedGetAssetsAsync.mockResolvedValue({ assets: [], endCursor: '', hasNextPage: false, totalCount: 5 });

    const albums = await PhotoLibraryService.getAlbums('photo');

    expect(albums.map((a) => a.id)).toEqual(['1']);
    // Empty album's combined assetCount is 0, so it's skipped before ever
    // querying its type-specific count.
    expect(mockedGetAssetsAsync).toHaveBeenCalledTimes(1);
  });

  it('excludes an album that has assets but none of the requested media type — e.g. an all-video import folder should never appear in the photo picker', async () => {
    mockedGetAlbumsAsync.mockResolvedValue([{ id: 'gopro', title: 'GoPro', assetCount: 40, type: 'album' }]);
    mockedGetAssetsAsync.mockResolvedValue({ assets: [], endCursor: '', hasNextPage: false, totalCount: 0 });

    const photoAlbums = await PhotoLibraryService.getAlbums('photo');

    expect(photoAlbums).toEqual([]);
    expect(mockedGetAssetsAsync).toHaveBeenCalledWith(
      expect.objectContaining({ album: 'gopro', mediaType: 'photo', first: 1 })
    );
  });

  it('includes that same all-video album in the video list', async () => {
    mockedGetAlbumsAsync.mockResolvedValue([{ id: 'gopro', title: 'GoPro', assetCount: 40, type: 'album' }]);
    mockedGetAssetsAsync.mockResolvedValue({ assets: [], endCursor: '', hasNextPage: false, totalCount: 40 });

    const videoAlbums = await PhotoLibraryService.getAlbums('video');

    expect(videoAlbums.map((a) => a.id)).toEqual(['gopro']);
    expect(mockedGetAssetsAsync).toHaveBeenCalledWith(
      expect.objectContaining({ album: 'gopro', mediaType: 'video', first: 1 })
    );
  });

  it("reports the type-specific count, not the album's combined assetCount, so the picker shows an accurate number", async () => {
    mockedGetAlbumsAsync.mockResolvedValue([{ id: 'mixed', title: 'Mixed', assetCount: 100, type: 'album' }]);
    mockedGetAssetsAsync.mockResolvedValue({ assets: [], endCursor: '', hasNextPage: false, totalCount: 12 });

    const photoAlbums = await PhotoLibraryService.getAlbums('photo');

    expect(photoAlbums[0].assetCount).toBe(12);
  });
});

describe('PhotoLibraryService album-scoped fetching (AlbumStrategy)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes albumId through getMediaPage as the native `album` filter', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('a')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 1,
    });

    await PhotoLibraryService.getMediaPage({ mediaTypes: ['photo', 'video'], first: 60, albumId: 'abc' });

    expect(mockedGetAssetsAsync).toHaveBeenCalledWith(expect.objectContaining({ album: 'abc' }));
  });

  it('passes albumId through getPreviewCandidates too', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('a')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 1,
    });

    await PhotoLibraryService.getPreviewCandidates({ mediaTypes: ['photo', 'video'], albumId: 'abc' });

    expect(mockedGetAssetsAsync).toHaveBeenCalledWith(expect.objectContaining({ album: 'abc' }));
  });
});

describe('PhotoLibraryService.manageLibraryAccess', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns true when opening Settings succeeds', async () => {
    jest.spyOn(Linking, 'openSettings').mockResolvedValue();

    await expect(PhotoLibraryService.manageLibraryAccess()).resolves.toBe(true);
  });

  /**
   * Confirmed via a real Sentry report ("Unable to open app settings")
   * that this native call can itself reject — must resolve to false, not
   * throw, so the caller can show feedback instead of an unhandled
   * rejection, and must still reach Sentry so it stays visible.
   */
  it('returns false and reports to Sentry when opening Settings fails', async () => {
    const error = new Error('Unable to open app settings');
    jest.spyOn(Linking, 'openSettings').mockRejectedValue(error);
    const captureSpy = jest.spyOn(Sentry, 'captureException');

    await expect(PhotoLibraryService.manageLibraryAccess()).resolves.toBe(false);
    expect(captureSpy).toHaveBeenCalledWith(error);
  });
});

describe('PhotoLibraryService.getFileSize caching', () => {
  // resetAllMocks, not clearAllMocks — the cache being tested here is a
  // real module-level Map that outlives any one test, so every test uses
  // its own never-reused uri; resetAllMocks additionally clears queued
  // mockResolvedValueOnce/mockRejectedValueOnce values (clearAllMocks
  // only clears call history), which otherwise leak into later tests.
  beforeEach(() => jest.resetAllMocks());

  it('reads a file once and reuses that size on later calls for the same uri, without touching disk again', async () => {
    mockedGetInfoAsync.mockResolvedValue({ exists: true, size: 5000 });

    await expect(PhotoLibraryService.getFileSize('file:///cache-a.jpg')).resolves.toBe(5000);
    await expect(PhotoLibraryService.getFileSize('file:///cache-a.jpg')).resolves.toBe(5000);

    expect(mockedGetInfoAsync).toHaveBeenCalledTimes(1);
  });

  it('does not cache a size for a different uri', async () => {
    mockedGetInfoAsync
      .mockResolvedValueOnce({ exists: true, size: 5000 })
      .mockResolvedValueOnce({ exists: true, size: 7000 });

    await expect(PhotoLibraryService.getFileSize('file:///cache-b1.jpg')).resolves.toBe(5000);
    await expect(PhotoLibraryService.getFileSize('file:///cache-b2.jpg')).resolves.toBe(7000);

    expect(mockedGetInfoAsync).toHaveBeenCalledTimes(2);
  });

  /**
   * A failed or cancelled read returning 0 is a transient outcome, not a
   * fact about the file — caching it would permanently and wrongly treat
   * a real, large file as 0 bytes after one flaky read.
   */
  it('does not cache a failed read, so a later call retries for real', async () => {
    mockedGetInfoAsync.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ exists: true, size: 5000 });

    await expect(PhotoLibraryService.getFileSize('file:///cache-c.jpg')).resolves.toBe(0);
    await expect(PhotoLibraryService.getFileSize('file:///cache-c.jpg')).resolves.toBe(5000);

    expect(mockedGetInfoAsync).toHaveBeenCalledTimes(2);
  });

  it('does not cache when the file does not exist', async () => {
    mockedGetInfoAsync.mockResolvedValueOnce({ exists: false }).mockResolvedValueOnce({ exists: true, size: 5000 });

    await expect(PhotoLibraryService.getFileSize('file:///cache-d.jpg')).resolves.toBe(0);
    await expect(PhotoLibraryService.getFileSize('file:///cache-d.jpg')).resolves.toBe(5000);

    expect(mockedGetInfoAsync).toHaveBeenCalledTimes(2);
  });
});
