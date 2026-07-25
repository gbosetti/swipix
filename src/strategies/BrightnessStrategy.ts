import { CategoryStrategy } from './CategoryStrategy';
import { analyzeImages } from '../services/ImageAnalysisService';
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

  constructor(minBrightness = 0, maxBrightness = 70) {
    super();
    this.minBrightness = minBrightness; // 0-255 scale
    this.maxBrightness = maxBrightness;
  }

  async matchCandidates(assets: Asset[]): Promise<Asset[]> {
    // One bulk call, not one await per photo — analyzeImages shares a
    // single decode across brightness/blur/duplicate-hash and caches by
    // asset id, so this doesn't re-analyze photos already seen this
    // session (e.g. from the Categories preview pass).
    const analysis = await analyzeImages(assets);
    return assets.filter((asset) => {
      const brightness = analysis.get(asset.id)?.brightness;
      return (
        brightness !== undefined &&
        brightness >= this.minBrightness &&
        brightness <= this.maxBrightness
      );
    });
  }

  get meta(): CategoryMeta {
    return {
      id: 'dark-photos',
      title: i18n.t('categories.dark-photos'),
      icon: 'moon',
    };
  }
}
