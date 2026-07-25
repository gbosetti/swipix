import { DuplicatesAndSimilarStrategy } from './DuplicatesAndSimilarStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { analyzeImages, hammingDistance } from '../services/ImageAnalysisService';
import { Asset } from '../types';

jest.mock('../services/PhotoLibraryService');
jest.mock('../services/TrashService', () => ({ TrashService: { getTrash: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/KeptService', () => ({ KeptService: { getKept: jest.fn().mockResolvedValue([]) } }));

// The exact-duplicate signal reads real file size off disk via
// expo-file-system's File — faked per-uri instead of touching the
// filesystem, same approach as BigPicturesStrategy.test.ts.
const fileSizes: Record<string, number> = {};
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    get size() {
      return fileSizes[uri];
    },
  })),
}));

// hammingDistance's own math is already covered by
// ImageAnalysisService.test.ts — mocked here so this file's tests stay
// focused on the strategy's three-signal union logic, not re-deriving
// hash math from dHash strings.
jest.mock('../services/ImageAnalysisService', () => ({
  ...jest.requireActual('../services/ImageAnalysisService'),
  analyzeImages: jest.fn(),
  hammingDistance: jest.fn(),
}));

const mockedPhotoLibraryService = PhotoLibraryService as jest.Mocked<typeof PhotoLibraryService>;
const mockedAnalyzeImages = analyzeImages as jest.MockedFunction<typeof analyzeImages>;
const mockedHammingDistance = hammingDistance as jest.MockedFunction<typeof hammingDistance>;

// Each call gets a distinct width/height/size by default (derived from a
// counter) so tests exercising the burst or hash signals don't
// accidentally also trip the exact-duplicate signal by sharing the same
// placeholder dimensions/size — a test must opt in to a collision by
// setting matching values explicitly.
let assetCounter = 0;

function makeAsset(
  id: string,
  overrides: Partial<Pick<Asset, 'mediaType' | 'creationTime' | 'width' | 'height'>> = {}
): Asset {
  assetCounter += 1;
  const uri = `file:///${id}`;
  if (!(uri in fileSizes)) fileSizes[uri] = 1000 + assetCounter;
  return {
    id,
    uri,
    mediaType: 'photo',
    creationTime: assetCounter * 100_000_000, // far apart by default, well outside the burst window
    duration: 0,
    width: 100 + assetCounter,
    height: 100 + assetCounter,
    mediaSubtypes: [],
    ...overrides,
  };
}

describe('DuplicatesAndSimilarStrategy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(fileSizes).forEach((key) => delete fileSizes[key]);
    mockedAnalyzeImages.mockResolvedValue(new Map());
    mockedHammingDistance.mockReturnValue(64); // "completely different" by default
  });

  it('matches exact duplicates by identical file size and dimensions', async () => {
    const a = makeAsset('a', { width: 200, height: 200 });
    const b = makeAsset('b', { width: 200, height: 200 });
    fileSizes[a.uri] = 5000;
    fileSizes[b.uri] = 5000;
    const unrelated = makeAsset('c', { width: 50, height: 50 });
    fileSizes[unrelated.uri] = 999;

    mockedPhotoLibraryService.getAllMedia.mockResolvedValue([a, b, unrelated]);
    const strategy = new DuplicatesAndSimilarStrategy();
    const result = await strategy.match([]);
    expect(result.map((asset) => asset.id).sort()).toEqual(['a', 'b']);
  });

  it('does not match photos that merely share a file size but differ in dimensions', async () => {
    const a = makeAsset('a', { width: 200, height: 200 });
    const b = makeAsset('b', { width: 300, height: 300 });
    fileSizes[a.uri] = 5000;
    fileSizes[b.uri] = 5000;
    mockedPhotoLibraryService.getAllMedia.mockResolvedValue([a, b]);
    const strategy = new DuplicatesAndSimilarStrategy();
    await expect(strategy.match([])).resolves.toEqual([]);
  });

  it('matches photos taken within the burst window (3 seconds)', async () => {
    const a = makeAsset('a', { creationTime: 1_000_000 });
    const b = makeAsset('b', { creationTime: 1_002_000 }); // +2s
    const farApart = makeAsset('c', { creationTime: 2_000_000 });
    mockedPhotoLibraryService.getAllMedia.mockResolvedValue([a, b, farApart]);
    const strategy = new DuplicatesAndSimilarStrategy();
    const result = await strategy.match([]);
    expect(result.map((asset) => asset.id).sort()).toEqual(['a', 'b']);
  });

  it('matches photos whose perceptual hash is within the similarity threshold, even with no other signal in common', async () => {
    const a = makeAsset('a', { creationTime: 1_000_000 });
    const b = makeAsset('b', { creationTime: 9_000_000 }); // far outside the burst window
    mockedPhotoLibraryService.getAllMedia.mockResolvedValue([a, b]);
    mockedAnalyzeImages.mockResolvedValue(
      new Map([
        [a.id, { brightness: 0, blurScore: 0, dHash: 'hash-a' }],
        [b.id, { brightness: 0, blurScore: 0, dHash: 'hash-b' }],
      ])
    );
    mockedHammingDistance.mockReturnValue(3); // within threshold
    const strategy = new DuplicatesAndSimilarStrategy();
    const result = await strategy.match([]);
    expect(result.map((asset) => asset.id).sort()).toEqual(['a', 'b']);
  });

  it('does not match two unrelated photos whose hash distance is large', async () => {
    const a = makeAsset('a', { creationTime: 1_000_000 });
    const b = makeAsset('b', { creationTime: 9_000_000 });
    mockedPhotoLibraryService.getAllMedia.mockResolvedValue([a, b]);
    mockedAnalyzeImages.mockResolvedValue(
      new Map([
        [a.id, { brightness: 0, blurScore: 0, dHash: 'hash-a' }],
        [b.id, { brightness: 0, blurScore: 0, dHash: 'hash-b' }],
      ])
    );
    mockedHammingDistance.mockReturnValue(40); // far outside threshold
    const strategy = new DuplicatesAndSimilarStrategy();
    await expect(strategy.match([])).resolves.toEqual([]);
  });

  it('excludes videos from the perceptual-hash signal but still lets them participate in exact-duplicate/burst signals', async () => {
    const videoA = makeAsset('videoA', { mediaType: 'video', width: 200, height: 200 });
    const videoB = makeAsset('videoB', { mediaType: 'video', width: 200, height: 200 });
    fileSizes[videoA.uri] = 9000;
    fileSizes[videoB.uri] = 9000;
    mockedPhotoLibraryService.getAllMedia.mockResolvedValue([videoA, videoB]);
    const strategy = new DuplicatesAndSimilarStrategy();
    const result = await strategy.match([]);
    // Matched via exact-duplicate (size+dimensions), not via the hash
    // signal, which only ever runs against mediaType 'photo' entries.
    expect(result.map((asset) => asset.id).sort()).toEqual(['videoA', 'videoB']);
    expect(mockedAnalyzeImages).toHaveBeenCalledWith([]);
  });

  it('does not match photos that share none of the three signals', async () => {
    const a = makeAsset('a', { creationTime: 1_000_000, width: 100, height: 100 });
    const b = makeAsset('b', { creationTime: 9_000_000, width: 200, height: 200 });
    fileSizes[a.uri] = 1000;
    fileSizes[b.uri] = 2000;
    mockedPhotoLibraryService.getAllMedia.mockResolvedValue([a, b]);
    const strategy = new DuplicatesAndSimilarStrategy();
    await expect(strategy.match([])).resolves.toEqual([]);
  });

  it('getPreview reuses the same duplicate-detection logic on a much smaller, separately-fetched sample instead of the full 200-item match set', async () => {
    const a = makeAsset('a', { width: 200, height: 200 });
    const b = makeAsset('b', { width: 200, height: 200 });
    fileSizes[a.uri] = 5000;
    fileSizes[b.uri] = 5000;
    mockedPhotoLibraryService.getAllMedia.mockResolvedValue([a, b]);
    const strategy = new DuplicatesAndSimilarStrategy();
    const preview = await strategy.getPreview();
    expect(['a', 'b']).toContain(preview?.id);
    expect(mockedPhotoLibraryService.getAllMedia).toHaveBeenCalledWith({ first: 15 });
  });
});
