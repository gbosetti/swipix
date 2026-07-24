import { CategoryStrategy } from './CategoryStrategy';
import { Asset, CategoryMeta, MediaTypeFilter } from '../types';
import i18n from '../i18n';

/**
 * The Videos-section counterpart to OnThisDayStrategy — same "today's
 * day-of-month and month, any earlier year" match, but videos only, so it
 * lives with the rest of the Videos section instead of being mixed into
 * the photo-only "On This Day" card.
 */
export class OnThisDayVideosStrategy extends CategoryStrategy {
  today: Date;

  constructor(today: Date = new Date()) {
    super();
    this.today = today;
  }

  async matchCandidates(assets: Asset[]): Promise<Asset[]> {
    const month = this.today.getMonth();
    const day = this.today.getDate();
    const year = this.today.getFullYear();
    return assets.filter((asset) => {
      if (asset.mediaType !== 'video') return false;
      const takenOn = new Date(asset.creationTime);
      return takenOn.getFullYear() < year && takenOn.getMonth() === month && takenOn.getDate() === day;
    });
  }

  get meta(): CategoryMeta {
    return {
      id: 'on-this-day-videos',
      title: i18n.t('categories.on-this-day-videos'),
      icon: 'sparkles-outline',
    };
  }

  get mediaTypes(): MediaTypeFilter[] {
    return ['video'];
  }
}
