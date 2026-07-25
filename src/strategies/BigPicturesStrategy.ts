import { File } from 'expo-file-system';
import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

// How many of the most recent photos to scan for the preview. Smaller than
// it looks like it needs to be: `detailed: true` below means each of these
// costs a real getAssetInfoAsync call, which — confirmed earlier this
// session — resolves synchronously on iOS's MAIN THREAD when not already
// prefetched. Confirmed again on a real device: capping JS-side
// concurrency isn't enough on its own, since these calls are effectively
// serialized on that one main thread regardless — total main-thread time
// scales with the raw count. 5, not 10/20: this preview, Big Videos', and
// Duplicates & Similar's all fire together on one Categories mount, and
// their combined total is what matters, not any one of them alone.
const PREVIEW_SAMPLE_SIZE = 5;

const DEFAULT_MIN_BYTES = 20 * 1024 * 1024; // 20 MB
const DEFAULT_MAX_BYTES = 200 * 1024 * 1024; // 200 MB

/**
 * Large photos specifically — split out from the old combined "Big
 * Files" category so photos and videos get their own size range and
 * their own place in the list (Pictures vs Videos section) instead of
 * one generic bucket that could silently be either. Filters whatever
 * photos it's handed (SwipeScreen/CategoryPickerScreen already paginate)
 * rather than self-fetching — a plain per-item size check needs no
 * whole-library view.
 */
export class BigPicturesStrategy extends CategoryStrategy {
  minBytes: number;
  maxBytes: number;

  constructor(minBytes = DEFAULT_MIN_BYTES, maxBytes = DEFAULT_MAX_BYTES) {
    super();
    this.minBytes = minBytes;
    this.maxBytes = maxBytes;
  }

  async matchCandidates(assets: Asset[]): Promise<Asset[]> {
    return assets.filter((asset) => {
      if (asset.mediaType !== 'photo') return false;
      const size = new File(asset.uri).size;
      return size >= this.minBytes && size <= this.maxBytes;
    });
  }

  get meta(): CategoryMeta {
    return {
      id: 'big-pictures',
      title: i18n.t('categories.big-pictures'),
      icon: 'archive',
    };
  }

  // Reads real file bytes off asset.uri (above) — needs a resolved file
  // path, not the fast ph:// reference SwipeScreen/previews otherwise use.
  get needsDetailedFetch(): boolean {
    return true;
  }

  // Real device confirmed: 3s (the default) wasn't enough for even 20
  // detailed fetches, let alone accounting for normal variance — see
  // PREVIEW_SAMPLE_SIZE's comment.
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
