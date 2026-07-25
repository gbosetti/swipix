import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

/**
 * No filter at all — every photo, shuffled. The "just start swiping"
 * entry point, and the fallback when more specific categories turn up
 * little. Fisher-Yates keeps the shuffle unbiased and doesn't mutate
 * the input array.
 */
export class RandomPhotosStrategy extends CategoryStrategy {
  async matchCandidates(assets: Asset[]): Promise<Asset[]> {
    const shuffled = [...assets];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  get meta(): CategoryMeta {
    return {
      id: 'random',
      title: i18n.t('categories.random'),
      icon: 'shuffle',
    };
  }

  // No filter, so the single most recent photo is always a valid preview.
  protected async findPreviewAsset(): Promise<Asset | null> {
    const candidates = await PhotoLibraryService.getPreviewCandidates({ mediaTypes: this.mediaTypes });
    const undecided = await this.excludeDecided(candidates);
    return undecided[0] ?? null;
  }
}
