import { ScreenshotStrategy } from './ScreenshotStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset } from '../types';

jest.mock('../services/TrashService', () => ({ TrashService: { getTrash: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/KeptService', () => ({ KeptService: { getKept: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/PhotoLibraryService', () => ({
  PhotoLibraryService: { getPreviewCandidates: jest.fn() },
}));

const mockedPhotoLibraryService = PhotoLibraryService as jest.Mocked<typeof PhotoLibraryService>;

function makeAsset(id: string, mediaSubtypes: string[]): Asset {
  return {
    id,
    uri: `file:///${id}.jpg`,
    mediaType: 'photo',
    creationTime: 0,
    duration: 0,
    width: 100,
    height: 100,
    mediaSubtypes,
  };
}

describe('ScreenshotStrategy', () => {
  it('matches only assets tagged with the screenshot mediaSubtype', async () => {
    const strategy = new ScreenshotStrategy();
    const assets = [
      makeAsset('a', ['screenshot']),
      makeAsset('b', []),
      makeAsset('c', ['screenshot', 'panorama']),
    ];
    const result = await strategy.match(assets);
    expect(result.map((a) => a.id)).toEqual(['a', 'c']);
  });

  it('does not match a photo with unrelated mediaSubtypes', async () => {
    const strategy = new ScreenshotStrategy();
    const assets = [makeAsset('a', ['panorama']), makeAsset('b', ['hdr'])];
    const result = await strategy.match(assets);
    expect(result).toEqual([]);
  });

  it('getPreview asks the OS directly for the most recent screenshot via a native mediaSubtypes filter, not a client-side scan', async () => {
    mockedPhotoLibraryService.getPreviewCandidates.mockResolvedValue([makeAsset('a', ['screenshot'])]);
    const strategy = new ScreenshotStrategy();
    const preview = await strategy.getPreview();
    expect(preview?.id).toBe('a');
    expect(mockedPhotoLibraryService.getPreviewCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ mediaSubtypes: ['screenshot'] })
    );
  });
});
