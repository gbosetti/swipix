import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

/**
 * Swipe through one specific album's photos instead of the whole library
 * — the "By Month" idea, but for a folder you already organized yourself
 * rather than a date range. Photos only — AlbumVideosStrategy is the
 * Videos-section counterpart, same split as MonthYearStrategy/
 * MonthYearVideosStrategy. The actual scoping happens natively (see
 * PhotoLibraryService.albumId threaded through getMediaPage/
 * getPreviewCandidates), so this strategy itself does no filtering of its
 * own: whatever SwipeScreen/CategoryPickerScreen hand it already only
 * contains this album's photos.
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
      // Fixed category label, like MonthYearStrategy's "By Month" — the
      // specific album name belongs in AlbumPicker's own row below the
      // card, not the card's title itself. id stays per-album so each
      // album gets its own preview cache entry when switched.
      id: `album-${this.id}`,
      title: i18n.t('categories.album'),
      icon: 'folder-outline',
    };
  }

  get albumId(): string | undefined {
    return this.id;
  }

  protected async findPreviewAsset(): Promise<Asset | null> {
    const candidates = await PhotoLibraryService.getPreviewCandidates({
      mediaTypes: this.mediaTypes,
      albumId: this.id,
    });
    const undecided = await this.excludeDecided(candidates);
    return undecided[0] ?? null;
  }
}
