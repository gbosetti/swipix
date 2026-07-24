import { ShortVideosStrategy } from './ShortVideosStrategy';
import { Asset } from '../types';

jest.mock('../services/TrashService', () => ({ TrashService: { getTrash: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/KeptService', () => ({ KeptService: { getKept: jest.fn().mockResolvedValue([]) } }));

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
  it('matches videos within the default 0-3 second range', async () => {
    const assets = [
      makeAsset('short', 'video', 2),
      makeAsset('long', 'video', 30),
      makeAsset('photo', 'photo', 0),
    ];
    const strategy = new ShortVideosStrategy();
    const result = await strategy.match(assets);
    expect(result.map((a) => a.id)).toEqual(['short']);
  });

  it('respects a custom min/max range', async () => {
    const assets = [makeAsset('a', 'video', 4), makeAsset('b', 'video', 8), makeAsset('c', 'video', 15)];
    const strategy = new ShortVideosStrategy(5, 10);
    const result = await strategy.match(assets);
    expect(result.map((a) => a.id)).toEqual(['b']);
  });

  it('never matches photos, even within the duration range', async () => {
    const assets = [makeAsset('a', 'photo', 1)];
    const strategy = new ShortVideosStrategy();
    await expect(strategy.match(assets)).resolves.toEqual([]);
  });
});
