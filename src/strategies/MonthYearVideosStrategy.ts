import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta, MediaTypeFilter } from '../types';
import i18n from '../i18n';

/**
 * The Videos-section counterpart to MonthYearStrategy — same "target a
 * specific month" idea (e.g. clear out an old trip's video clips), but
 * videos only, so it lives with the rest of the Videos section instead
 * of being mixed into the photo-only "By Month" card.
 */
export class MonthYearVideosStrategy extends CategoryStrategy {
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
      (asset) => asset.mediaType === 'video' && asset.creationTime >= start && asset.creationTime < end
    );
  }

  get meta(): CategoryMeta {
    return {
      id: 'month-year-videos',
      title: i18n.t('categories.month-year-videos'),
      icon: 'calendar-outline',
    };
  }

  get mediaTypes(): MediaTypeFilter[] {
    return ['video'];
  }

  /** See MonthYearStrategy's identical override for the rationale. */
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
