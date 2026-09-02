import { BrightnessStrategy } from './BrightnessStrategy';
import { analyzeImages } from '../services/ImageAnalysisService';
import { Asset } from '../types';

jest.mock('../services/ImageAnalysisService');
jest.mock('../services/TrashService', () => ({ TrashService: { getTrash: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/KeptService', () => ({ KeptService: { getKept: jest.fn().mockResolvedValue([]) } }));

const mockedAnalyzeImages = analyzeImages as jest.MockedFunction<typeof analyzeImages>;

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

describe('BrightnessStrategy', () => {
  beforeEach(() => jest.clearAllMocks());

  it('matches photos within the default 0-70 brightness range', async () => {
    const dark = makeAsset('dark');
    const bright = makeAsset('bright');
    mockedAnalyzeImages.mockResolvedValue(
      new Map([
        [dark.id, { brightness: 20, blurScore: 0, dHash: '0' }],
        [bright.id, { brightness: 200, blurScore: 0, dHash: '0' }],
      ])
    );
    const strategy = new BrightnessStrategy();
    const result = await strategy.match([dark, bright]);
    expect(result.map((a) => a.id)).toEqual(['dark']);
  });

  it('respects a custom brightness range', async () => {
    const asset = makeAsset('a');
    mockedAnalyzeImages.mockResolvedValue(new Map([[asset.id, { brightness: 150, blurScore: 0, dHash: '0' }]]));
    const strategy = new BrightnessStrategy(100, 200);
    await expect(strategy.match([asset])).resolves.toEqual([asset]);
  });

  it('excludes a photo the analysis pipeline could not process (regression: an undecodable photo must not crash the whole category)', async () => {
    const asset = makeAsset('undecodable');
    mockedAnalyzeImages.mockResolvedValue(new Map()); /** analysis failed, no entry for this asset */
    const strategy = new BrightnessStrategy();
    await expect(strategy.match([asset])).resolves.toEqual([]);
  });

  it('threads onScanProgress through to analyzeImages', async () => {
    const asset = makeAsset('a');
    mockedAnalyzeImages.mockResolvedValue(new Map());
    const strategy = new BrightnessStrategy();

    const onScanProgress = jest.fn();
    await strategy.match([asset], { onProgress: onScanProgress });
    expect(mockedAnalyzeImages).toHaveBeenCalledWith([asset], onScanProgress);
  });
});
