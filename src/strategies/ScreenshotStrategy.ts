import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta, ScanContext } from '../types';
import i18n from '../i18n';

/**
 * See RandomPhotosStrategy's identical constant and rationale — no
 * per-item cost, so it's cheap to sample deep enough that a fast swiping
 * session through this exact category can't decide every candidate.
 */
const PREVIEW_SAMPLE_SIZE = 50;

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

  /** Native filter — asks the OS directly for the most recent screenshots. */
  protected async findPreviewAsset(context?: ScanContext): Promise<Asset | null> {
    const candidates = await PhotoLibraryService.getPreviewCandidates({
      mediaTypes: this.mediaTypes,
      mediaSubtypes: ['screenshot'],
      first: PREVIEW_SAMPLE_SIZE,
      priority: context?.priority,
      isCancelled: context?.isCancelled,
    });
    const undecided = await this.excludeDecided(candidates);
    return undecided[0] ?? null;
  }
}
