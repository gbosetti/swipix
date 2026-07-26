import { File } from 'expo-file-system';
import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

// `detailed: true` below means each of these costs a real getAssetInfoAsync
// call, which serializes on iOS's main thread regardless of JS concurrency.
// Kept small since this preview, Big Videos', and Duplicates & Similar's
// all fire together on one Categories mount — their combined total is
// what matters.
const PREVIEW_SAMPLE_SIZE = 5;

const DEFAULT_MIN_BYTES = 20 * 1024 * 1024; // 20 MB
const DEFAULT_MAX_BYTES = 200 * 1024 * 1024; // 200 MB

/**
 * Large photos — split from the old combined "Big Files" category so
 * photos and videos get their own range and section. Filters whatever
 * it's handed rather than self-fetching; a per-item size check needs no
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

  // Reads real file bytes off asset.uri — needs a resolved file path,
  // not the fast ph:// reference SwipeScreen/previews otherwise use.
  get needsDetailedFetch(): boolean {
    return true;
  }

  get isSlowScan(): boolean {
    return true;
  }

  // 3s (the default) wasn't enough for even 20 detailed fetches.
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
