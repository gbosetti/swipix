import { AlbumVideosStrategy } from './AlbumVideosStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset } from '../types';

jest.mock('../services/TrashService', () => ({ TrashService: { getTrash: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/KeptService', () => ({ KeptService: { getKept: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/PhotoLibraryService', () => ({
  PhotoLibraryService: { getPreviewCandidates: jest.fn() },
}));

const mockedPhotoLibraryService = PhotoLibraryService as jest.Mocked<typeof PhotoLibraryService>;

function makeAsset(id: string): Asset {
  return {
    id,
    uri: `ph://${id}`,
    mediaType: 'video',
    creationTime: 0,
    duration: 10,
    width: 100,
    height: 100,
    mediaSubtypes: [],
  };
}

describe('AlbumVideosStrategy', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not filter further — the album scoping already happened natively', async () => {
    const strategy = new AlbumVideosStrategy('album-1');
    const assets = [makeAsset('a'), makeAsset('b')];
    await expect(strategy.match(assets)).resolves.toEqual(assets);
  });

  it('is videos only — the Videos-section counterpart to AlbumStrategy', () => {
    const strategy = new AlbumVideosStrategy('album-1');
    expect(strategy.mediaTypes).toEqual(['video']);
  });

  it('exposes the album id for SwipeScreen/PhotoLibraryService to scope the fetch with', () => {
    const strategy = new AlbumVideosStrategy('album-1');
    expect(strategy.albumId).toBe('album-1');
  });

  it('meta.id is distinct from AlbumStrategy\'s for the same album id, so photo/video previews of the same folder never collide in the cache', () => {
    const strategy = new AlbumVideosStrategy('album-1');
    expect(strategy.meta.id).toBe('album-videos-album-1');
  });

  it('getPreview scopes the preview lookup to this album, videos only', async () => {
    mockedPhotoLibraryService.getPreviewCandidates.mockResolvedValue([makeAsset('a')]);
    const strategy = new AlbumVideosStrategy('album-1');
    const preview = await strategy.getPreview();
    expect(preview?.id).toBe('a');
    expect(mockedPhotoLibraryService.getPreviewCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ albumId: 'album-1', mediaTypes: ['video'] })
    );
  });
});
