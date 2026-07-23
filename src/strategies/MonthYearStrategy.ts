import { CategoryStrategy } from './CategoryStrategy';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

/**
 * Lets someone target a specific month (e.g. clear out an old trip or a
 * one-off backlog) by date rather than by what the photo looks like.
 * Photos only — MonthYearVideosStrategy is the Videos-section
 * counterpart, so each section's "by month" card only ever surfaces its
 * own media type, consistent with the rest of the Pictures/Videos split.
 * Filters whatever photos it's handed rather than self-fetching —
 * SwipeScreen's pagination already keeps searching further back until it
 * finds enough matches (or exhausts the library), which is more thorough
 * than a one-shot fetch of only the most recent photos.
 */
export class MonthYearStrategy extends CategoryStrategy {
  year: number;
  month: number; // 0-11

  constructor(year: number, month: number) {
    super();
    this.year = year;
    this.month = month;
  }

  async matchCandidates(assets: Asset[]): Promise<Asset[]> {
    const start = new Date(this.year, this.month, 1).getTime();
    const end = new Date(this.year, this.month + 1, 1).getTime();
    return assets.filter(
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
