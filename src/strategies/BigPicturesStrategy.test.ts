import { BigPicturesStrategy } from './BigPicturesStrategy';
import { Asset } from '../types';

jest.mock('../services/TrashService', () => ({ TrashService: { getTrash: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/KeptService', () => ({ KeptService: { getKept: jest.fn().mockResolvedValue([]) } }));

// expo-file-system's File is a class whose `.size` this strategy reads
// directly from the (real) file on disk — tests fake that per-uri via a
// lookup map instead of touching the filesystem.
const fileSizes: Record<string, number> = {};
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    get size() {
      return fileSizes[uri];
    },
  })),
}));

function makeAsset(id: string, mediaType: 'photo' | 'video', sizeBytes: number): Asset {
  const uri = `file:///${id}`;
  fileSizes[uri] = sizeBytes;
  return {
    id,
    uri,
    mediaType,
    creationTime: 0,
    duration: 0,
    width: 100,
    height: 100,
    mediaSubtypes: [],
  };
}

const MB = 1024 * 1024;

describe('BigPicturesStrategy', () => {
  beforeEach(() => {
    Object.keys(fileSizes).forEach((key) => delete fileSizes[key]);
  });

  it('matches photos within the default 20-200MB range', async () => {
    const assets = [makeAsset('big', 'photo', 50 * MB), makeAsset('small', 'photo', 1 * MB)];
    const strategy = new BigPicturesStrategy();
    const result = await strategy.match(assets);
    expect(result.map((a) => a.id)).toEqual(['big']);
  });

  it('respects a custom byte range, including an Infinity upper bound', async () => {
    const assets = [makeAsset('huge', 'photo', 500 * MB), makeAsset('small', 'photo', 1 * MB)];
    const strategy = new BigPicturesStrategy(10 * MB, Infinity);
    const result = await strategy.match(assets);
    expect(result.map((a) => a.id)).toEqual(['huge']);
  });

  it('never matches videos, even oversized ones', async () => {
    const assets = [makeAsset('video', 'video', 500 * MB)];
    const strategy = new BigPicturesStrategy();
    await expect(strategy.match(assets)).resolves.toEqual([]);
  });
});
