import { BlurredImagesStrategy } from './BlurredImagesStrategy';
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

describe('BlurredImagesStrategy', () => {
  beforeEach(() => jest.clearAllMocks());

  it('matches photos above the blur threshold (45, calibrated against a real device library — see issue #10)', async () => {
    const sharp = makeAsset('sharp');
    const blurry = makeAsset('blurry');
    mockedAnalyzeImages.mockResolvedValue(
      new Map([
        [sharp.id, { brightness: 0, blurScore: 0, dHash: '0' }],
        [blurry.id, { brightness: 0, blurScore: 84, dHash: '0' }],
      ])
    );
    const strategy = new BlurredImagesStrategy();
    const result = await strategy.match([sharp, blurry]);
    expect(result.map((a) => a.id)).toEqual(['blurry']);
  });

  it('does not match a photo exactly at the threshold (strictly greater-than)', async () => {
    const asset = makeAsset('borderline');
    mockedAnalyzeImages.mockResolvedValue(new Map([[asset.id, { brightness: 0, blurScore: 45, dHash: '0' }]]));
    const strategy = new BlurredImagesStrategy();
    await expect(strategy.match([asset])).resolves.toEqual([]);
  });

  it('excludes a photo the analysis pipeline could not process', async () => {
    const asset = makeAsset('undecodable');
    mockedAnalyzeImages.mockResolvedValue(new Map());
    const strategy = new BlurredImagesStrategy();
    await expect(strategy.match([asset])).resolves.toEqual([]);
  });

  it('threads onScanProgress through to analyzeImages', async () => {
    const asset = makeAsset('a');
    mockedAnalyzeImages.mockResolvedValue(new Map());
    const strategy = new BlurredImagesStrategy();

    const onScanProgress = jest.fn();
    await strategy.match([asset], { onProgress: onScanProgress });
    expect(mockedAnalyzeImages).toHaveBeenCalledWith([asset], onScanProgress);
  });
});
