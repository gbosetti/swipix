import * as MediaLibrary from 'expo-media-library';
import { PhotoLibraryService } from './PhotoLibraryService';

jest.mock('expo-media-library', () => ({
  getAssetsAsync: jest.fn(),
  getAssetInfoAsync: jest.fn(),
  SortBy: { creationTime: 'creationTime' },
}));

const mockedGetAssetsAsync = MediaLibrary.getAssetsAsync as jest.Mock;
const mockedGetAssetInfoAsync = MediaLibrary.getAssetInfoAsync as jest.Mock;

function rawAsset(id: string, mediaType: 'photo' | 'video' = 'photo') {
  return {
    id,
    uri: `ph://${id}`,
    mediaType,
    creationTime: 1000,
    duration: 0,
    width: 100,
    height: 100,
  };
}

describe('PhotoLibraryService.getMediaPage', () => {
  beforeEach(() => jest.clearAllMocks());

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

  it('still resolves videos through getAssetInfoAsync, since expo-video needs a real file path', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('v1', 'video')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 1,
    });
    mockedGetAssetInfoAsync.mockResolvedValue({ localUri: 'file:///v1.mov', mediaSubtypes: [] });

    const page = await PhotoLibraryService.getMediaPage({ mediaTypes: ['video'], first: 60 });

    expect(mockedGetAssetInfoAsync).toHaveBeenCalledTimes(1);
    expect(page.assets).toEqual([expect.objectContaining({ id: 'v1', uri: 'file:///v1.mov' })]);
  });

  it('omits video assets with no resolvable localUri rather than including an unusable ph:// uri', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('good', 'video'), rawAsset('missing', 'video')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 2,
    });
    mockedGetAssetInfoAsync.mockImplementation(async (asset: { id: string }) =>
      asset.id === 'good' ? { localUri: 'file:///good.mov', mediaSubtypes: [] } : { localUri: null }
    );

    const page = await PhotoLibraryService.getMediaPage({ mediaTypes: ['video'], first: 60 });

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
      if (asset.id === 'bad') throw new Error('native failure');
      return { localUri: 'file:///good.mov', mediaSubtypes: [] };
    });

    const page = await PhotoLibraryService.getMediaPage({ mediaTypes: ['video'], first: 60 });

    expect(page.assets.map((a) => a.id)).toEqual(['good']);
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

    expect(peak).toBeLessThanOrEqual(30);
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

  it('evicts a request that never settles, so a later identical request can retry instead of hanging on the same dead promise forever (regression: a real device report — thumbnails loaded once, then never again, even after restarting the app)', async () => {
    // First call's underlying native fetch never resolves.
    mockedGetAssetsAsync.mockReturnValueOnce(new Promise(() => {}));
    const stuckPromise = PhotoLibraryService.getPreviewCandidates({ mediaTypes: ['photo'] });
    // Move past the 15s eviction window.
    jest.advanceTimersByTime(15000);

    // A later, identical request should get a fresh fetch, not the same
    // still-pending promise.
    mockedGetAssetsAsync.mockResolvedValueOnce({
      assets: [rawAsset('a')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 1,
    });
    const recovered = await PhotoLibraryService.getPreviewCandidates({ mediaTypes: ['photo'] });

    expect(recovered.map((a) => a.id)).toEqual(['a']);
    expect(mockedGetAssetsAsync).toHaveBeenCalledTimes(2);
    void stuckPromise; // never resolves; deliberately not awaited
  });
});
