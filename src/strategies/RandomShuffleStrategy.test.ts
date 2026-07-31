import { RandomShuffleStrategy } from './RandomShuffleStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset } from '../types';

jest.mock('../services/PhotoLibraryService', () => ({
  PhotoLibraryService: { getDateRange: jest.fn(), getPreviewCandidates: jest.fn() },
}));
jest.mock('../services/TrashService', () => ({ TrashService: { getTrash: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/KeptService', () => ({ KeptService: { getKept: jest.fn().mockResolvedValue([]) } }));

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

describe('RandomShuffleStrategy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPhotoLibraryService.getDateRange.mockResolvedValue({
      oldest: new Date(2020, 0, 1),
      newest: new Date(2026, 0, 1),
    });
  });

  it('samples a window anchored at a random point within the library\'s real date span, not just the newest assets', async () => {
    mockedPhotoLibraryService.getPreviewCandidates.mockResolvedValue(['a', 'b'].map(makeAsset));
    const strategy = new RandomShuffleStrategy();

    await strategy.match([]);

    expect(mockedPhotoLibraryService.getDateRange).toHaveBeenCalledWith(['photo'], expect.anything());
    const call = mockedPhotoLibraryService.getPreviewCandidates.mock.calls[0][0];
    expect(call.createdBefore).toBeInstanceOf(Date);
    const oldest = new Date(2020, 0, 1).getTime();
    const newest = new Date(2026, 0, 1).getTime();
    expect(call.createdBefore!.getTime()).toBeGreaterThanOrEqual(oldest);
    expect(call.createdBefore!.getTime()).toBeLessThanOrEqual(newest);
  });

  it('returns every asset from the sampled window, shuffled — not filtered', async () => {
    const assets = ['a', 'b', 'c', 'd'].map(makeAsset);
    mockedPhotoLibraryService.getPreviewCandidates.mockResolvedValue(assets);
    const strategy = new RandomShuffleStrategy();

    const result = await strategy.match([]);

    expect(new Set(result.map((a) => a.id))).toEqual(new Set(assets.map((a) => a.id)));
  });

  it('resolves to an empty match when the library has no assets at all, instead of throwing', async () => {
    mockedPhotoLibraryService.getDateRange.mockResolvedValue(null);
    const strategy = new RandomShuffleStrategy();

    await expect(strategy.match([])).resolves.toEqual([]);
    expect(mockedPhotoLibraryService.getPreviewCandidates).not.toHaveBeenCalled();
  });

  it('getPreview reuses the same random-window sampling on a single-item draw', async () => {
    mockedPhotoLibraryService.getPreviewCandidates.mockResolvedValue([makeAsset('a')]);
    const strategy = new RandomShuffleStrategy();

    const preview = await strategy.getPreview();

    expect(preview?.id).toBe('a');
    expect(mockedPhotoLibraryService.getPreviewCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ first: 5 })
    );
  });
});
