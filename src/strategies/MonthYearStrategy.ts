import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta, ScanContext } from '../types';
import i18n from '../i18n';

/**
 * Targets a specific month by date rather than by what the photo looks
 * like. Photos only — MonthYearVideosStrategy is the Videos counterpart.
 * Filters whatever it's handed; SwipeScreen's pagination already keeps
 * searching further back until it finds enough matches.
 */
export class MonthYearStrategy extends CategoryStrategy {
  year: number;
  month: number; // 0-11

  constructor(year: number, month: number) {
    super();
    this.year = year;
    this.month = month;
  }

  get dateRange(): { after: Date; before: Date } {
    return { after: new Date(this.year, this.month, 1), before: new Date(this.year, this.month + 1, 1) };
  }

  async matchCandidates(assets: Asset[]): Promise<Asset[]> {
    const start = this.dateRange.after.getTime();
    const end = this.dateRange.before.getTime();
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

  /**
   * Native date filters ask the OS directly for a photo IN that month,
   * rather than hoping one turns up in a "most recent overall" sample.
   */
  protected async findPreviewAsset(context?: ScanContext): Promise<Asset | null> {
    const candidates = await PhotoLibraryService.getPreviewCandidates({
      mediaTypes: this.mediaTypes,
      createdAfter: this.dateRange.after,
      createdBefore: this.dateRange.before,
      priority: context?.priority,
      isCancelled: context?.isCancelled,
    });
    const undecided = await this.excludeDecided(candidates);
    return undecided[0] ?? null;
  }
}
