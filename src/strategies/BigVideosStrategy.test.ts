import { BigVideosStrategy } from './BigVideosStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset } from '../types';

jest.mock('../services/PhotoLibraryService');
jest.mock('../services/TrashService', () => ({ TrashService: { getTrash: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/KeptService', () => ({ KeptService: { getKept: jest.fn().mockResolvedValue([]) } }));

const fileSizes: Record<string, number> = {};
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    get size() {
      return fileSizes[uri];
    },
  })),
}));

const mockedPhotoLibraryService = PhotoLibraryService as jest.Mocked<typeof PhotoLibraryService>;

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
    jest.clearAllMocks();
    Object.keys(fileSizes).forEach((key) => delete fileSizes[key]);
  });

  it('matches videos within the default 100MB-2GB range', async () => {
    mockedPhotoLibraryService.getAllMedia.mockResolvedValue([
      makeAsset('big', 'video', 500 * MB),
      makeAsset('small', 'video', 10 * MB),
    ]);
    const strategy = new BigVideosStrategy();
    const result = await strategy.match([]);
    expect(result.map((a) => a.id)).toEqual(['big']);
  });

  it('catches a multi-gigabyte video that a photo-sized ceiling would have missed', async () => {
    mockedPhotoLibraryService.getAllMedia.mockResolvedValue([makeAsset('huge', 'video', 5 * GB)]);
    const strategy = new BigVideosStrategy(100 * MB, Infinity);
    const result = await strategy.match([]);
    expect(result.map((a) => a.id)).toEqual(['huge']);
  });

  it('never matches photos, even oversized ones', async () => {
    mockedPhotoLibraryService.getAllMedia.mockResolvedValue([makeAsset('photo', 'photo', 500 * MB)]);
    const strategy = new BigVideosStrategy();
    await expect(strategy.match([])).resolves.toEqual([]);
  });
});
