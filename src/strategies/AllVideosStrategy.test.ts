import { AllVideosStrategy } from './AllVideosStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset } from '../types';

jest.mock('../services/PhotoLibraryService');
jest.mock('../services/TrashService', () => ({ TrashService: { getTrash: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/KeptService', () => ({ KeptService: { getKept: jest.fn().mockResolvedValue([]) } }));

const mockedPhotoLibraryService = PhotoLibraryService as jest.Mocked<typeof PhotoLibraryService>;

function makeAsset(id: string, mediaType: 'photo' | 'video'): Asset {
  return {
    id,
    uri: `file:///${id}`,
    mediaType,
    creationTime: 0,
    duration: mediaType === 'video' ? 10 : 0,
    width: 100,
    height: 100,
    mediaSubtypes: [],
  };
}

describe('AllVideosStrategy', () => {
  beforeEach(() => jest.clearAllMocks());

  it('matches every video regardless of duration', async () => {
    mockedPhotoLibraryService.getAllMedia.mockResolvedValue([
      makeAsset('short', 'video'),
      makeAsset('photo', 'photo'),
      makeAsset('long', 'video'),
    ]);
    const strategy = new AllVideosStrategy();
    const result = await strategy.match([]);
    expect(result.map((a) => a.id).sort()).toEqual(['long', 'short']);
  });

  it('never matches photos', async () => {
    mockedPhotoLibraryService.getAllMedia.mockResolvedValue([makeAsset('a', 'photo')]);
    const strategy = new AllVideosStrategy();
    await expect(strategy.match([])).resolves.toEqual([]);
  });
});
