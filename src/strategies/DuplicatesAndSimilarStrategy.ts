import { File } from 'expo-file-system';
import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { analyzeImages, hammingDistance, HAMMING_THRESHOLD } from '../services/ImageAnalysisService';
import { Asset, CategoryMeta, ScanProgressCallback } from '../types';
import i18n from '../i18n';

// Photos this close together are probably a burst.
const BURST_WINDOW_MS = 3 * 1000;

// Fetching 500 assets and dHash-analyzing all of them was enough real-
// device CPU pressure to trip iOS's hang watchdog. A smaller cap trades
// completeness (200 most recent, not 500) for safety.
const FETCH_LIMIT = 200;

// No fast native shortcut exists for this category — finding a duplicate
// requires comparing photos against each other, so the preview reuses the
// same detection on a smaller sample (see findDuplicates) with the most
// generous timeout of any category. 15, not 60: these calls effectively
// serialize on iOS's main thread regardless of JS concurrency, so total
// time scales with raw count.
const PREVIEW_FETCH_LIMIT = 15;
const PREVIEW_TIMEOUT_MS = 5000;

/**
 * "Which of these are redundant copies?", detected three ways, unioned
 * rather than intersected — a photo needs to match only one signal:
 *
 * - Exact duplicates: same file size and pixel dimensions (e.g. the same
 *   photo saved twice from different apps).
 * - Burst clusters: shot within a few seconds of each other.
 * - Perceptual similarity: a difference hash comparing rough visual
 *   similarity, not exact pixels — catches a retake or minor edit, at
 *   the cost of occasional false positives (tracked in issue #10).
 *   Photos only; videos still participate in the other two signals.
 *
 * Sources its own photos+videos via `getAllMedia()`, since exact-duplicate
 * detection needs videos too.
 */
export class DuplicatesAndSimilarStrategy extends CategoryStrategy {
  async matchCandidates(_assets: Asset[], onScanProgress?: ScanProgressCallback): Promise<Asset[]> {
    // 'high' — only ever called from an active swipe session (match()),
    // never from the Categories preview path (findPreviewAsset below).
    const media = await PhotoLibraryService.getAllMedia({
      first: FETCH_LIMIT,
      onProgress: onScanProgress,
      priority: 'high',
    });
    return this.findDuplicates(media, onScanProgress);
  }

  /** Shared by matchCandidates and findPreviewAsset so both run the same
   * detection, just on differently-sized samples. */
  private async findDuplicates(media: Asset[], onScanProgress?: ScanProgressCallback): Promise<Asset[]> {
    const bySizeAndDimensions = new Map<string, Asset[]>();
    for (const asset of media) {
      const size = new File(asset.uri).size;
      const key = `${size}-${asset.width}-${asset.height}`;
      const group = bySizeAndDimensions.get(key);
      if (group) {
        group.push(asset);
      } else {
        bySizeAndDimensions.set(key, [asset]);
      }
    }
    const exactDuplicateIds = new Set(
      Array.from(bySizeAndDimensions.values())
        .filter((group) => group.length >= 2)
        .flat()
        .map((asset) => asset.id)
    );

    const sortedByTime = [...media].sort((a, b) => a.creationTime - b.creationTime);
    const clusters: Asset[][] = [];
    for (const asset of sortedByTime) {
      const currentCluster = clusters[clusters.length - 1];
      const lastInCluster = currentCluster?.[currentCluster.length - 1];
      if (lastInCluster && asset.creationTime - lastInCluster.creationTime <= BURST_WINDOW_MS) {
        currentCluster.push(asset);
      } else {
        clusters.push([asset]);
      }
    }
    const burstIds = new Set(
      clusters
        .filter((cluster) => cluster.length >= 2)
        .flat()
        .map((asset) => asset.id)
    );

    const photos = media.filter((asset) => asset.mediaType === 'photo');
    const analysis = await analyzeImages(photos, onScanProgress);
    const hashed = photos
      .map((asset) => ({ asset, hash: analysis.get(asset.id)?.dHash }))
      .filter((entry): entry is { asset: Asset; hash: string } => entry.hash !== undefined);

    // O(n^2), but at FETCH_LIMIT=200 that's ~20k cheap integer ops — not
    // worth an approximate-nearest-neighbor index at this scale.
    const similarIds = new Set<string>();
    for (let i = 0; i < hashed.length; i++) {
      for (let j = i + 1; j < hashed.length; j++) {
        if (hammingDistance(hashed[i].hash, hashed[j].hash) <= HAMMING_THRESHOLD) {
          similarIds.add(hashed[i].asset.id);
          similarIds.add(hashed[j].asset.id);
        }
      }
    }

    const matchedIds = new Set([...exactDuplicateIds, ...burstIds, ...similarIds]);
    return media.filter((asset) => matchedIds.has(asset.id));
  }

  get meta(): CategoryMeta {
    return {
      id: 'duplicates-similar',
      title: i18n.t('categories.duplicates-similar'),
      icon: 'copy',
    };
  }

  get isSlowScan(): boolean {
    return true;
  }

  protected previewTimeoutMs = PREVIEW_TIMEOUT_MS;

  protected async findPreviewAsset(): Promise<Asset | null> {
    const media = await PhotoLibraryService.getAllMedia({ first: PREVIEW_FETCH_LIMIT });
    const matched = await this.findDuplicates(media);
    const undecided = await this.excludeDecided(matched);
    return undecided[0] ?? null;
  }
}
