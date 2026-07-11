import { CategoryStrategy } from './CategoryStrategy';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

/**
 * iOS tags screenshots with a specific mediaSubtype / albumId in the
 * photo library metadata — no image analysis needed at all. This is
 * the fastest and most trustworthy category available.
 */
export class ScreenshotStrategy extends CategoryStrategy {
  async match(assets: Asset[]): Promise<Asset[]> {
    return assets.filter((asset) => asset.mediaSubtypes?.includes('screenshot'));
  }

  get meta(): CategoryMeta {
    return {
      id: 'screenshots',
      title: i18n.t('categories.screenshots'),
      icon: 'crop',
    };
  }
}
