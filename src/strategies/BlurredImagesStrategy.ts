import { CategoryStrategy } from './CategoryStrategy';
import { getBlurScore } from '../services/ImageAnalysisService';
import { Asset, CategoryMeta } from '../types';

const BLUR_THRESHOLD = 60; // 0 (sharp) - 100 (very blurry)

/**
 * Flags photos above a blur threshold. Unlike Brightness, this relies on
 * a stubbed analysis (see ImageAnalysisService.getBlurScore) — no honest
 * cheap heuristic exists for blur the way screenshot-tagging or file size
 * do, so this category is only as good as that stub until real
 * edge-detection is wired in.
 */
export class BlurredImagesStrategy extends CategoryStrategy {
  async match(assets: Asset[]): Promise<Asset[]> {
    const results: Asset[] = [];
    for (const asset of assets) {
      const blurScore = await getBlurScore(asset.uri);
      if (blurScore > BLUR_THRESHOLD) {
        results.push(asset);
      }
    }
    return results;
  }

  get meta(): CategoryMeta {
    return {
      id: 'blurred-images',
      title: 'Blurred Photos',
      icon: 'aperture',
    };
  }
}
