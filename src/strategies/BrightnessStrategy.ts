import { CategoryStrategy } from './CategoryStrategy';
import { getAverageBrightness } from '../services/ImageAnalysisService';
import { Asset, CategoryMeta } from '../types';

/**
 * Flags photos below a brightness threshold. This is a cheap, deterministic
 * pixel-average calculation — no ML involved, so it's never embarrassingly
 * wrong — which is why it's the category to lead with in the UI.
 */
export class BrightnessStrategy extends CategoryStrategy {
  brightnessThreshold: number;

  constructor(brightnessThreshold = 40) {
    super();
    this.brightnessThreshold = brightnessThreshold; // 0-255 scale
  }

  async match(assets: Asset[]): Promise<Asset[]> {
    const results: Asset[] = [];
    for (const asset of assets) {
      const brightness = await getAverageBrightness(asset.uri);
      if (brightness < this.brightnessThreshold) {
        results.push(asset);
      }
    }
    return results;
  }

  get meta(): CategoryMeta {
    return {
      id: 'dark-photos',
      title: 'Dark Photos',
      icon: 'moon',
    };
  }
}
