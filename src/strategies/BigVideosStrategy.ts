import { File } from 'expo-file-system';
import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta, MediaTypeFilter } from '../types';
import i18n from '../i18n';

// See BigPicturesStrategy's identical constant.
const PREVIEW_SAMPLE_SIZE = 5;

const DEFAULT_MIN_BYTES = 100 * 1024 * 1024; // 100 MB
const DEFAULT_MAX_BYTES = 2000 * 1024 * 1024; // ~2 GB

/**
 * Large videos — the other half of the old "Big Files" category. Uses a
 * much higher byte range than Big Pictures: a video routinely lands in
 * the 1-3GB range, where a photo-sized ceiling would miss most of it.
 */
export class BigVideosStrategy extends CategoryStrategy {
  minBytes: number;
  maxBytes: number;

  constructor(minBytes = DEFAULT_MIN_BYTES, maxBytes = DEFAULT_MAX_BYTES) {
    super();
    this.minBytes = minBytes;
    this.maxBytes = maxBytes;
  }

  async matchCandidates(assets: Asset[]): Promise<Asset[]> {
    return assets.filter((asset) => {
      if (asset.mediaType !== 'video') return false;
      const size = new File(asset.uri).size;
      return size >= this.minBytes && size <= this.maxBytes;
    });
  }

  get meta(): CategoryMeta {
    return {
      id: 'big-videos',
      title: i18n.t('categories.big-videos'),
      icon: 'archive-outline',
    };
  }

  get mediaTypes(): MediaTypeFilter[] {
    return ['video'];
  }

  // Reads real file bytes off asset.uri — needs a resolved file path.
  get needsDetailedFetch(): boolean {
    return true;
  }

  // See BigPicturesStrategy's identical override.
  protected previewTimeoutMs = 6000;

  protected async findPreviewAsset(): Promise<Asset | null> {
    const candidates = await PhotoLibraryService.getPreviewCandidates({
      mediaTypes: this.mediaTypes,
      first: PREVIEW_SAMPLE_SIZE,
      detailed: true,
    });
    const matched = await this.matchCandidates(candidates);
    const undecided = await this.excludeDecided(matched);
    return undecided[0] ?? null;
  }
}
