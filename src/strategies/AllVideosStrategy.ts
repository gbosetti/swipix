import { CategoryStrategy } from './CategoryStrategy';
import { Asset, CategoryMeta, MediaTypeFilter } from '../types';
import i18n from '../i18n';

/**
 * Every video, no duration filter — the general "clean up my videos"
 * entry point, complementing Short Videos' narrow accidental-recording
 * filter.
 */
export class AllVideosStrategy extends CategoryStrategy {
  async matchCandidates(assets: Asset[]): Promise<Asset[]> {
    return assets.filter((asset) => asset.mediaType === 'video');
  }

  get meta(): CategoryMeta {
    return {
      id: 'all-videos',
      title: i18n.t('categories.all-videos'),
      icon: 'videocam-outline',
    };
  }

  get mediaTypes(): MediaTypeFilter[] {
    return ['video'];
  }
}
