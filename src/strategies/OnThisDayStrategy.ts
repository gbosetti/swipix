import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

/**
 * Nostalgia surface: photos taken on today's day-of-month and month in any
 * earlier year (2024-07-22 -> matches every past July 22nd, not July of
 * this year). Excludes the current year — a photo taken earlier today
 * isn't a memory yet, it's just today's photo.
 */
export class OnThisDayStrategy extends CategoryStrategy {
  today: Date;

  constructor(today: Date = new Date()) {
    super();
    this.today = today;
  }

  async matchCandidates(_assets: Asset[]): Promise<Asset[]> {
    const month = this.today.getMonth();
    const day = this.today.getDate();
    const year = this.today.getFullYear();
    const media = await PhotoLibraryService.getAllMedia();
    return media.filter((asset) => {
      if (asset.mediaType !== 'photo') return false;
      const takenOn = new Date(asset.creationTime);
      return takenOn.getFullYear() < year && takenOn.getMonth() === month && takenOn.getDate() === day;
    });
  }

  get meta(): CategoryMeta {
    return {
      id: 'on-this-day',
      title: i18n.t('categories.on-this-day'),
      icon: 'sparkles',
    };
  }
}
