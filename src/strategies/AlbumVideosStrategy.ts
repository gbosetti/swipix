import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta, MediaTypeFilter, ScanContext } from '../types';
import i18n from '../i18n';

/**
 * The Videos-section counterpart to AlbumStrategy — same "swipe just this
 * album" idea, but videos only, so it lives with the rest of the Videos
 * section instead of being mixed into the photo-only "By Album" card.
 */
export class AlbumVideosStrategy extends CategoryStrategy {
  private readonly id: string;

  constructor(albumId: string) {
    super();
    this.id = albumId;
  }

  async matchCandidates(assets: Asset[]): Promise<Asset[]> {
    return assets;
  }

  get meta(): CategoryMeta {
    return {
      id: `album-videos-${this.id}`,
      title: i18n.t('categories.album-videos'),
      icon: 'folder-outline',
    };
  }

  get mediaTypes(): MediaTypeFilter[] {
    return ['video'];
  }

  get albumId(): string | undefined {
    return this.id;
  }

  protected async findPreviewAsset(context?: ScanContext): Promise<Asset | null> {
    const candidates = await PhotoLibraryService.getPreviewCandidates({
      mediaTypes: this.mediaTypes,
      albumId: this.id,
      priority: context?.priority,
      isCancelled: context?.isCancelled,
    });
    const undecided = await this.excludeDecided(candidates);
    return undecided[0] ?? null;
  }
}
