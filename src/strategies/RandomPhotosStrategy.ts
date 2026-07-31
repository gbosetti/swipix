import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

// No per-item cost (a plain native query, no pixel decode or file read),
// so this can afford to be much bigger than the pixel-analysis strategies'
// sample size — confirmed on a real device: with the old default of 5, a
// fast swiping session through this exact category could decide all 5 of
// the newest photos, leaving findPreviewAsset with nothing undecided to
// show even though the library still has plenty left deeper in.
const PREVIEW_SAMPLE_SIZE = 50;

/**
 * No filter at all — every photo, shuffled. The "just start swiping"
 * entry point, and the fallback when more specific categories turn up
 * little. Fisher-Yates keeps the shuffle unbiased and doesn't mutate
 * the input array.
 *
 * @remarks
 * Only shuffles within whatever page SwipeScreen's own sequential
 * pagination is currently on — a long session still reads as a coarse
 * newest-to-oldest sweep, since pages are fetched and appended in that
 * order. See RandomShuffleStrategy for a category that's scattered
 * across the whole library instead.
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

  protected async findPreviewAsset(): Promise<Asset | null> {
    const candidates = await PhotoLibraryService.getPreviewCandidates({
      mediaTypes: this.mediaTypes,
      first: PREVIEW_SAMPLE_SIZE,
    });
    const undecided = await this.excludeDecided(candidates);
    return undecided[0] ?? null;
  }
}
