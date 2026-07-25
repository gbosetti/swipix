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

  // createdAfter/createdBefore are native filters (see
  // PhotoLibraryService), so this asks the OS directly for the most
  // recent photo IN that specific month instead of hoping one turns up in
  // a shared "most recent overall" sample — a January 2020 selection
  // would never find anything in a recency-sorted sample otherwise.
  protected async findPreviewAsset(): Promise<Asset | null> {
    const candidates = await PhotoLibraryService.getPreviewCandidates({
      mediaTypes: this.mediaTypes,
      createdAfter: new Date(this.year, this.month, 1),
      createdBefore: new Date(this.year, this.month + 1, 1),
    });
    const undecided = await this.excludeDecided(candidates);
    return undecided[0] ?? null;
  }
}
