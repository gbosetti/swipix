import { MonthYearStrategy } from './MonthYearStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset } from '../types';

jest.mock('../services/TrashService', () => ({ TrashService: { getTrash: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/KeptService', () => ({ KeptService: { getKept: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/PhotoLibraryService', () => ({
  PhotoLibraryService: { getPreviewCandidates: jest.fn() },
}));

const mockedPhotoLibraryService = PhotoLibraryService as jest.Mocked<typeof PhotoLibraryService>;

function makeAsset(id: string, mediaType: 'photo' | 'video', creationTime: number): Asset {
  return {
    id,
    uri: `file:///${id}`,
    mediaType,
    creationTime,
    duration: 0,
    width: 100,
    height: 100,
    mediaSubtypes: [],
  };
}

describe('MonthYearStrategy', () => {
  it('matches photos taken within the given month, excluding the boundary days of adjacent months', async () => {
    const inMonth = new Date(2026, 2, 15).getTime(); // March 15, 2026
    const lastDayOfPrevMonth = new Date(2026, 1, 28, 23, 59, 59).getTime();
    const firstDayOfNextMonth = new Date(2026, 3, 1).getTime();

    const assets = [
      makeAsset('inMonth', 'photo', inMonth),
      makeAsset('prevMonth', 'photo', lastDayOfPrevMonth),
      makeAsset('nextMonth', 'photo', firstDayOfNextMonth),
    ];

    const strategy = new MonthYearStrategy(2026, 2); // March (0-indexed)
    const result = await strategy.match(assets);
    expect(result.map((a) => a.id)).toEqual(['inMonth']);
  });

  it('never matches videos, even within the target month', async () => {
    const inMonth = new Date(2026, 2, 15).getTime();
    const assets = [makeAsset('video', 'video', inMonth)];
    const strategy = new MonthYearStrategy(2026, 2);
    await expect(strategy.match(assets)).resolves.toEqual([]);
  });

  it('getPreview asks the OS directly for a photo within that month via a native date-range filter, not a client-side scan of recent photos (regression: a January 2020 selection would never surface anything in a "most recent overall" sample)', async () => {
    mockedPhotoLibraryService.getPreviewCandidates.mockResolvedValue([
      makeAsset('a', 'photo', new Date(2026, 2, 15).getTime()),
    ]);
    const strategy = new MonthYearStrategy(2026, 2);
    const preview = await strategy.getPreview();
    expect(preview?.id).toBe('a');
    expect(mockedPhotoLibraryService.getPreviewCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAfter: new Date(2026, 2, 1),
        createdBefore: new Date(2026, 3, 1),
      })
    );
  });
});
