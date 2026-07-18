import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

/**
 * Lets someone target a specific month (e.g. clear out an old trip or a
 * one-off backlog) by date rather than by what the photo looks like.
 * Photos only — MonthYearVideosStrategy is the Videos-section
 * counterpart, so each section's "by month" card only ever surfaces its
 * own media type, consistent with the rest of the Pictures/Videos split.
 */
export class MonthYearStrategy extends CategoryStrategy {
  year: number;
  month: number; // 0-11

  constructor(year: number, month: number) {
    super();
    this.year = year;
    this.month = month;
  }

  async matchCandidates(_assets: Asset[]): Promise<Asset[]> {
    const start = new Date(this.year, this.month, 1).getTime();
    const end = new Date(this.year, this.month + 1, 1).getTime();
    const media = await PhotoLibraryService.getAllMedia();
    return media.filter(
      (asset) => asset.mediaType === 'photo' && asset.creationTime >= start && asset.creationTime < end
    );
  }

  get meta(): CategoryMeta {
    return {
      id: 'month-year',
      title: i18n.t('categories.month-year'),
      icon: 'calendar',
    };
  }
}
