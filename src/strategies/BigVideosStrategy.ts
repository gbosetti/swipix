import { File } from 'expo-file-system';
import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta, MediaTypeFilter } from '../types';
import i18n from '../i18n';

// See BigPicturesStrategy's identical constant for the rationale.
const PREVIEW_SAMPLE_SIZE = 5;

const DEFAULT_MIN_BYTES = 100 * 1024 * 1024; // 100 MB
const DEFAULT_MAX_BYTES = 2000 * 1024 * 1024; // ~2 GB

/**
 * Large videos specifically — the other half of the old combined "Big
 * Files" category, split out so it lives with the rest of the Videos
 * section instead of mixed in with photo categories. Uses a much higher
 * byte range than Big Pictures: a photo rarely exceeds ~200MB even at
 * ProRAW quality, but a longer or higher-resolution video routinely
 * lands in the 1-3GB range, so a photo-sized ceiling would silently
 * miss most of what people actually mean by "big video."
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

  // Reads real file bytes off asset.uri (above) — needs a resolved file
  // path, not the fast ph:// reference SwipeScreen/previews otherwise use.
  get needsDetailedFetch(): boolean {
    return true;
  }

  // See BigPicturesStrategy's identical override for the rationale —
  // confirmed via a real-device timeout log for that category.
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
