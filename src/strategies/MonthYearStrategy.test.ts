import { MonthYearStrategy } from './MonthYearStrategy';
import { Asset } from '../types';

jest.mock('../services/TrashService', () => ({ TrashService: { getTrash: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/KeptService', () => ({ KeptService: { getKept: jest.fn().mockResolvedValue([]) } }));

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
});
