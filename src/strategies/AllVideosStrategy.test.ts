import { AllVideosStrategy } from './AllVideosStrategy';
import { Asset } from '../types';

jest.mock('../services/TrashService', () => ({ TrashService: { getTrash: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/KeptService', () => ({ KeptService: { getKept: jest.fn().mockResolvedValue([]) } }));

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
  it('matches every video regardless of duration', async () => {
    const assets = [makeAsset('short', 'video'), makeAsset('photo', 'photo'), makeAsset('long', 'video')];
    const strategy = new AllVideosStrategy();
    const result = await strategy.match(assets);
    expect(result.map((a) => a.id).sort()).toEqual(['long', 'short']);
  });

  it('never matches photos', async () => {
    const assets = [makeAsset('a', 'photo')];
    const strategy = new AllVideosStrategy();
    await expect(strategy.match(assets)).resolves.toEqual([]);
  });
});
