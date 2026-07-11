import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

/**
 * Lets someone target a specific month (e.g. clear out an old trip or a
 * one-off backlog) by date rather than by what the photo looks like.
 * Needs videos alongside photos, so it sources its own dataset via
 * getAllMedia() like BigFiles/ShortVideos do.
 */
export class MonthYearStrategy extends CategoryStrategy {
  year: number;
  month: number; // 0-11

  constructor(year: number, month: number) {
    super();
    this.year = year;
    this.month = month;
  }

  async match(_assets: Asset[]): Promise<Asset[]> {
    const start = new Date(this.year, this.month, 1).getTime();
    const end = new Date(this.year, this.month + 1, 1).getTime();
    const media = await PhotoLibraryService.getAllMedia();
    return media.filter((asset) => asset.creationTime >= start && asset.creationTime < end);
  }

  get meta(): CategoryMeta {
    return {
      id: 'month-year',
      title: i18n.t('categories.month-year'),
      icon: 'calendar',
    };
  }
}
