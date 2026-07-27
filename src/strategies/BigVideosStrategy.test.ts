import { BigVideosStrategy } from './BigVideosStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset } from '../types';

jest.mock('../services/TrashService', () => ({ TrashService: { getTrash: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/KeptService', () => ({ KeptService: { getKept: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/PhotoLibraryService', () => ({
  PhotoLibraryService: { getPreviewCandidates: jest.fn(), getFileSize: jest.fn() },
}));

const mockedPhotoLibraryService = PhotoLibraryService as jest.Mocked<typeof PhotoLibraryService>;

const fileSizes: Record<string, number> = {};

function makeAsset(id: string, mediaType: 'photo' | 'video', sizeBytes: number): Asset {
  const uri = `file:///${id}`;
  fileSizes[uri] = sizeBytes;
  return {
    id,
    uri,
    mediaType,
    creationTime: 0,
    duration: 60,
    width: 100,
    height: 100,
    mediaSubtypes: [],
  };
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

describe('BigVideosStrategy', () => {
  beforeEach(() => {
    Object.keys(fileSizes).forEach((key) => delete fileSizes[key]);
    mockedPhotoLibraryService.getFileSize.mockImplementation(async (uri) => fileSizes[uri] ?? 0);
  });

  it('matches videos within the default 100MB-2GB range', async () => {
    const assets = [makeAsset('big', 'video', 500 * MB), makeAsset('small', 'video', 10 * MB)];
    const strategy = new BigVideosStrategy();
    const result = await strategy.match(assets);
    expect(result.map((a) => a.id)).toEqual(['big']);
  });

  it('catches a multi-gigabyte video that a photo-sized ceiling would have missed', async () => {
    const assets = [makeAsset('huge', 'video', 5 * GB)];
    const strategy = new BigVideosStrategy(100 * MB, Infinity);
    const result = await strategy.match(assets);
    expect(result.map((a) => a.id)).toEqual(['huge']);
  });

  it('never matches photos, even oversized ones', async () => {
    const assets = [makeAsset('photo', 'photo', 500 * MB)];
    const strategy = new BigVideosStrategy();
    await expect(strategy.match(assets)).resolves.toEqual([]);
  });

  it('requests a detailed (resolved-file-path) fetch, not the fast ph:// path — see BigPicturesStrategy for the full rationale', () => {
    const strategy = new BigVideosStrategy();
    expect(strategy.needsDetailedFetch).toBe(true);
  });


  it('getPreview finds a big video among a small detailed preview sample', async () => {
    mockedPhotoLibraryService.getPreviewCandidates.mockResolvedValue([
      makeAsset('big', 'video', 500 * MB),
      makeAsset('small', 'video', 10 * MB),
    ]);
    const strategy = new BigVideosStrategy();
    const preview = await strategy.getPreview();
    expect(preview?.id).toBe('big');
  });
});
