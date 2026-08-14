import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta, ScanContext } from '../types';
import i18n from '../i18n';

/**
 * Swipes one specific album's photos instead of the whole library.
 * Photos only — AlbumVideosStrategy is the Videos counterpart. Scoping
 * happens natively (see PhotoLibraryService's `albumId` param), so this
 * strategy does no filtering of its own.
 */
export class AlbumStrategy extends CategoryStrategy {
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
      // Fixed label — the album name belongs in AlbumPicker's own row,
      // not the card title. id stays per-album for its own preview cache.
      id: `album-${this.id}`,
      title: i18n.t('categories.album'),
      icon: 'folder-outline',
    };
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
