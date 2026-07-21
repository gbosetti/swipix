import { ShortVideosStrategy } from './ShortVideosStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset } from '../types';

jest.mock('../services/PhotoLibraryService');
jest.mock('../services/TrashService', () => ({ TrashService: { getTrash: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/KeptService', () => ({ KeptService: { getKept: jest.fn().mockResolvedValue([]) } }));

const mockedPhotoLibraryService = PhotoLibraryService as jest.Mocked<typeof PhotoLibraryService>;

function makeAsset(id: string, mediaType: 'photo' | 'video', duration: number): Asset {
  return {
    id,
    uri: `file:///${id}.mov`,
    mediaType,
    creationTime: 0,
    duration,
    width: 100,
    height: 100,
    mediaSubtypes: [],
  };
}

describe('ShortVideosStrategy', () => {
  beforeEach(() => jest.clearAllMocks());

  it('matches videos within the default 0-3 second range', async () => {
    mockedPhotoLibraryService.getAllMedia.mockResolvedValue([
      makeAsset('short', 'video', 2),
      makeAsset('long', 'video', 30),
      makeAsset('photo', 'photo', 0),
    ]);
    const strategy = new ShortVideosStrategy();
    const result = await strategy.match([]);
    expect(result.map((a) => a.id)).toEqual(['short']);
  });

  it('respects a custom min/max range', async () => {
    mockedPhotoLibraryService.getAllMedia.mockResolvedValue([
      makeAsset('a', 'video', 4),
      makeAsset('b', 'video', 8),
      makeAsset('c', 'video', 15),
    ]);
    const strategy = new ShortVideosStrategy(5, 10);
    const result = await strategy.match([]);
    expect(result.map((a) => a.id)).toEqual(['b']);
  });

  it('never matches photos, even within the duration range', async () => {
    mockedPhotoLibraryService.getAllMedia.mockResolvedValue([makeAsset('a', 'photo', 1)]);
    const strategy = new ShortVideosStrategy();
    await expect(strategy.match([])).resolves.toEqual([]);
  });
});
