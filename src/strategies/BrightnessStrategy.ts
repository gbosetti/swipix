import { CategoryStrategy } from './CategoryStrategy';
import { getAverageBrightness } from '../services/ImageAnalysisService';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

/**
 * Flags photos within a brightness range. This is a cheap, deterministic
 * pixel-average calculation — no ML involved, so it's never embarrassingly
 * wrong — which is why it's the category to lead with in the UI.
 */
export class BrightnessStrategy extends CategoryStrategy {
  minBrightness: number;
  maxBrightness: number;

  constructor(minBrightness = 0, maxBrightness = 40) {
    super();
    this.minBrightness = minBrightness; // 0-255 scale
    this.maxBrightness = maxBrightness;
  }

  async match(assets: Asset[]): Promise<Asset[]> {
    const results: Asset[] = [];
    for (const asset of assets) {
      const brightness = await getAverageBrightness(asset.uri);
      if (brightness >= this.minBrightness && brightness <= this.maxBrightness) {
        results.push(asset);
      }
    }
    return results;
  }

  get meta(): CategoryMeta {
    return {
      id: 'dark-photos',
      title: i18n.t('categories.dark-photos'),
      icon: 'moon',
    };
  }
}
