import { RandomPhotosStrategy } from './RandomPhotosStrategy';
import { Asset } from '../types';

jest.mock('../services/TrashService', () => ({ TrashService: { getTrash: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/KeptService', () => ({ KeptService: { getKept: jest.fn().mockResolvedValue([]) } }));

function makeAsset(id: string): Asset {
  return {
    id,
    uri: `file:///${id}.jpg`,
    mediaType: 'photo',
    creationTime: 0,
    duration: 0,
    width: 100,
    height: 100,
    mediaSubtypes: [],
  };
}

describe('RandomPhotosStrategy', () => {
  it('returns every asset it was given — a shuffle, not a filter', async () => {
    const strategy = new RandomPhotosStrategy();
    const assets = ['a', 'b', 'c', 'd', 'e'].map(makeAsset);
    const result = await strategy.match(assets);
    expect(result).toHaveLength(assets.length);
    expect(new Set(result.map((a) => a.id))).toEqual(new Set(assets.map((a) => a.id)));
  });

  it('does not mutate the input array', async () => {
    const strategy = new RandomPhotosStrategy();
    const assets = ['a', 'b', 'c'].map(makeAsset);
    const original = [...assets];
    await strategy.match(assets);
    expect(assets).toEqual(original);
  });

  it('handles an empty library without throwing', async () => {
    const strategy = new RandomPhotosStrategy();
    await expect(strategy.match([])).resolves.toEqual([]);
  });
});
