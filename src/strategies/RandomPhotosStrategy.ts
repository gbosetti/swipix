import { CategoryStrategy } from './CategoryStrategy';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

/**
 * No filter at all — every photo, shuffled. The "just start swiping"
 * entry point for people who don't want to pick a category first, and
 * the reliable fallback when the more specific categories don't turn up
 * much (a light library, or one already mostly cleaned up). Surfaced
 * both as the standalone Swipe tab and as the first card in Categories.
 * Fisher-Yates keeps the shuffle unbiased and doesn't mutate the input
 * array PhotoLibraryService handed us.
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
}
