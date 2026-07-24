import { OnThisDayVideosStrategy } from './OnThisDayVideosStrategy';
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

describe('OnThisDayVideosStrategy', () => {
  it('matches videos taken on the same day and month in past years, excluding same-day-different-month and the current year', async () => {
    const today = new Date(2026, 6, 22); // July 22, 2026
    const oneYearAgo = new Date(2025, 6, 22, 9, 30).getTime();
    const fiveYearsAgo = new Date(2021, 6, 22, 18, 0).getTime();
    const sameDayThisYear = new Date(2026, 6, 22, 8, 0).getTime();
    const sameMonthDifferentDay = new Date(2025, 6, 23).getTime();
    const sameDayDifferentMonth = new Date(2025, 7, 22).getTime();

    const assets = [
      makeAsset('oneYearAgo', 'video', oneYearAgo),
      makeAsset('fiveYearsAgo', 'video', fiveYearsAgo),
      makeAsset('today', 'video', sameDayThisYear),
      makeAsset('differentDay', 'video', sameMonthDifferentDay),
      makeAsset('differentMonth', 'video', sameDayDifferentMonth),
    ];

    const strategy = new OnThisDayVideosStrategy(today);
    const result = await strategy.match(assets);
    expect(result.map((a) => a.id).sort()).toEqual(['fiveYearsAgo', 'oneYearAgo']);
  });

  it('never matches photos, even on the same day in a past year', async () => {
    const today = new Date(2026, 6, 22);
    const photo = new Date(2025, 6, 22).getTime();
    const assets = [makeAsset('photo', 'photo', photo)];
    const strategy = new OnThisDayVideosStrategy(today);
    await expect(strategy.match(assets)).resolves.toEqual([]);
  });
});
