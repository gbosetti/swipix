import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

/**
 * Every video, no duration filter — the general "clean up my videos"
 * entry point, complementing Short Videos' narrow accidental-recording
 * filter. Sources its own dataset via getAllMedia() like the other
 * video/size-based categories.
 */
export class AllVideosStrategy extends CategoryStrategy {
  async matchCandidates(_assets: Asset[]): Promise<Asset[]> {
    const media = await PhotoLibraryService.getAllMedia();
    return media.filter((asset) => asset.mediaType === 'video');
  }

  get meta(): CategoryMeta {
    return {
      id: 'all-videos',
      title: i18n.t('categories.all-videos'),
      icon: 'videocam-outline',
    };
  }
}
