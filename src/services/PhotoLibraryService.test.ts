import * as MediaLibrary from 'expo-media-library';
import { PhotoLibraryService } from './PhotoLibraryService';

jest.mock('expo-media-library', () => ({
  getAssetsAsync: jest.fn(),
  getAssetInfoAsync: jest.fn(),
  SortBy: { creationTime: 'creationTime' },
}));

const mockedGetAssetsAsync = MediaLibrary.getAssetsAsync as jest.Mock;
const mockedGetAssetInfoAsync = MediaLibrary.getAssetInfoAsync as jest.Mock;

function rawAsset(id: string) {
  return {
    id,
    uri: `ph://${id}`,
    mediaType: 'photo',
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
    mockedGetAssetInfoAsync.mockResolvedValue({ localUri: 'file:///a.jpg', mediaSubtypes: [] });

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

  it('omits assets with no resolvable localUri rather than including an unusable ph:// uri', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('good'), rawAsset('missing')],
      endCursor: 'cursor-2',
      hasNextPage: false,
      totalCount: 2,
    });
    mockedGetAssetInfoAsync.mockImplementation(async (asset: { id: string }) =>
      asset.id === 'good' ? { localUri: 'file:///good.jpg', mediaSubtypes: [] } : { localUri: null }
    );

    const page = await PhotoLibraryService.getMediaPage({ mediaTypes: ['photo'], first: 60 });

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
    mockedGetAssetInfoAsync.mockResolvedValue({ localUri: 'file:///a.jpg', mediaSubtypes: [] });

    await PhotoLibraryService.getMediaPage({ mediaTypes: ['photo', 'video'], first: 60 });

    expect(mockedGetAssetsAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: ['photo', 'video'] })
    );
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
