import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta, MediaTypeFilter, ScanContext } from '../types';
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

  /** No filter at all, so the single most recent video is always valid. */
  protected async findPreviewAsset(context?: ScanContext): Promise<Asset | null> {
    const candidates = await PhotoLibraryService.getPreviewCandidates({
      mediaTypes: this.mediaTypes,
      priority: context?.priority,
      isCancelled: context?.isCancelled,
    });
    const undecided = await this.excludeDecided(candidates);
    return undecided[0] ?? null;
  }
}
