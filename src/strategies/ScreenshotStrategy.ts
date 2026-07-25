import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

/**
 * iOS tags screenshots with a specific mediaSubtype / albumId in the
 * photo library metadata — no image analysis needed at all. This is
 * the fastest and most trustworthy category available.
 */
export class ScreenshotStrategy extends CategoryStrategy {
  async matchCandidates(assets: Asset[]): Promise<Asset[]> {
    return assets.filter((asset) => asset.mediaSubtypes?.includes('screenshot'));
  }

  get meta(): CategoryMeta {
    return {
      id: 'screenshots',
      title: i18n.t('categories.screenshots'),
      icon: 'crop',
    };
  }

  // Native filter — asks the OS directly for the most recent screenshot.
  protected async findPreviewAsset(): Promise<Asset | null> {
    const candidates = await PhotoLibraryService.getPreviewCandidates({
      mediaTypes: this.mediaTypes,
      mediaSubtypes: ['screenshot'],
    });
    const undecided = await this.excludeDecided(candidates);
    return undecided[0] ?? null;
  }
}
