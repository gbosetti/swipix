import { AlbumStrategy } from './AlbumStrategy';
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
    mediaType: 'photo',
    creationTime: 0,
    duration: 0,
    width: 100,
    height: 100,
    mediaSubtypes: [],
  };
}

describe('AlbumStrategy', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not filter further — the album scoping already happened natively', async () => {
    const strategy = new AlbumStrategy('album-1');
    const assets = [makeAsset('a'), makeAsset('b')];
    await expect(strategy.match(assets)).resolves.toEqual(assets);
  });

  it('is photos only — AlbumVideosStrategy is the Videos-section counterpart', () => {
    const strategy = new AlbumStrategy('album-1');
    expect(strategy.mediaTypes).toEqual(['photo']);
  });

  it('exposes the album id for SwipeScreen/PhotoLibraryService to scope the fetch with', () => {
    const strategy = new AlbumStrategy('album-1');
    expect(strategy.albumId).toBe('album-1');
  });

  it('meta.id is unique per album, so switching albums gets its own preview cache entry', () => {
    const a = new AlbumStrategy('album-1');
    const b = new AlbumStrategy('album-2');
    expect(a.meta.id).not.toBe(b.meta.id);
  });

  it('getPreview scopes the preview lookup to this album, photos only', async () => {
    mockedPhotoLibraryService.getPreviewCandidates.mockResolvedValue([makeAsset('a')]);
    const strategy = new AlbumStrategy('album-1');
    const preview = await strategy.getPreview();
    expect(preview?.id).toBe('a');
    expect(mockedPhotoLibraryService.getPreviewCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ albumId: 'album-1', mediaTypes: ['photo'] })
    );
  });
});
