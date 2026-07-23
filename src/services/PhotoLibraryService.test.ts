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

describe('PhotoLibraryService.getPhotosPage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes the cursor through to getAssetsAsync and returns endCursor/hasNextPage', async () => {
    mockedGetAssetsAsync.mockResolvedValue({
      assets: [rawAsset('a')],
      endCursor: 'cursor-2',
      hasNextPage: true,
      totalCount: 100,
    });
    mockedGetAssetInfoAsync.mockResolvedValue({ localUri: 'file:///a.jpg', mediaSubtypes: [] });

    const page = await PhotoLibraryService.getPhotosPage({ first: 60, after: 'cursor-1' });

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

    const page = await PhotoLibraryService.getPhotosPage({ first: 60 });

    expect(page.assets.map((a) => a.id)).toEqual(['good']);
    expect(page.hasNextPage).toBe(false);
  });
});
