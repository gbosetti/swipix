import { MonthYearVideosStrategy } from './MonthYearVideosStrategy';
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

describe('MonthYearVideosStrategy', () => {
  it('matches videos taken within the given month', async () => {
    const inMonth = new Date(2026, 2, 15).getTime();
    const outOfMonth = new Date(2026, 3, 1).getTime();
    const assets = [makeAsset('inMonth', 'video', inMonth), makeAsset('outOfMonth', 'video', outOfMonth)];
    const strategy = new MonthYearVideosStrategy(2026, 2);
    const result = await strategy.match(assets);
    expect(result.map((a) => a.id)).toEqual(['inMonth']);
  });

  it('never matches photos, even within the target month', async () => {
    const inMonth = new Date(2026, 2, 15).getTime();
    const assets = [makeAsset('photo', 'photo', inMonth)];
    const strategy = new MonthYearVideosStrategy(2026, 2);
    await expect(strategy.match(assets)).resolves.toEqual([]);
  });
});
