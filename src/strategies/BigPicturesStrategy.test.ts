import { BigPicturesStrategy } from './BigPicturesStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset } from '../types';

jest.mock('../services/TrashService', () => ({ TrashService: { getTrash: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/KeptService', () => ({ KeptService: { getKept: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/PhotoLibraryService', () => ({
  PhotoLibraryService: { getPreviewCandidates: jest.fn(), getFileSize: jest.fn() },
}));

const mockedPhotoLibraryService = PhotoLibraryService as jest.Mocked<typeof PhotoLibraryService>;

/**
 * This strategy reads real file size via PhotoLibraryService.getFileSize —
 * faked per-uri via a lookup map instead of touching the filesystem.
 */
const fileSizes: Record<string, number> = {};

function makeAsset(id: string, mediaType: 'photo' | 'video', sizeBytes: number): Asset {
  const uri = `file:///${id}`;
  fileSizes[uri] = sizeBytes;
  return {
    id,
    uri,
    mediaType,
    creationTime: 0,
    duration: 0,
    width: 100,
    height: 100,
    mediaSubtypes: [],
  };
}

const MB = 1024 * 1024;

describe('BigPicturesStrategy', () => {
  beforeEach(() => {
    Object.keys(fileSizes).forEach((key) => delete fileSizes[key]);
    mockedPhotoLibraryService.getFileSize.mockImplementation(async (uri) => fileSizes[uri] ?? 0);
  });

  it('matches photos within the default 20-200MB range', async () => {
    const assets = [makeAsset('big', 'photo', 50 * MB), makeAsset('small', 'photo', 1 * MB)];
    const strategy = new BigPicturesStrategy();
    const result = await strategy.match(assets);
    expect(result.map((a) => a.id)).toEqual(['big']);
  });

  it('respects a custom byte range, including an Infinity upper bound', async () => {
    const assets = [makeAsset('huge', 'photo', 500 * MB), makeAsset('small', 'photo', 1 * MB)];
    const strategy = new BigPicturesStrategy(10 * MB, Infinity);
    const result = await strategy.match(assets);
    expect(result.map((a) => a.id)).toEqual(['huge']);
  });

  it('never matches videos, even oversized ones', async () => {
    const assets = [makeAsset('video', 'video', 500 * MB)];
    const strategy = new BigPicturesStrategy();
    await expect(strategy.match(assets)).resolves.toEqual([]);
  });

  it('requests a detailed (resolved-file-path) fetch, not the fast ph:// path (regression: a ph:// reference has no real bytes for getFileSize to read — this strategy silently broke on real devices once the default fetch switched to ph:// for speed)', () => {
    const strategy = new BigPicturesStrategy();
    expect(strategy.needsDetailedFetch).toBe(true);
  });

  it('getPreview finds a big photo among a small detailed preview sample', async () => {
    mockedPhotoLibraryService.getPreviewCandidates.mockResolvedValue([
      makeAsset('big', 'photo', 50 * MB),
      makeAsset('small', 'photo', 1 * MB),
    ]);
    const strategy = new BigPicturesStrategy();
    const preview = await strategy.getPreview();
    expect(preview?.id).toBe('big');
    expect(mockedPhotoLibraryService.getPreviewCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ detailed: true })
    );
  });
});
