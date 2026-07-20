import { File } from 'expo-file-system';
import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { analyzeImages, hammingDistance, HAMMING_THRESHOLD } from '../services/ImageAnalysisService';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

const BURST_WINDOW_MS = 3 * 1000; // photos this close together are probably a burst

/**
 * Merges what used to be two separate categories, since to a user
 * they're the same underlying question — "which of these are redundant
 * copies?" — just detected three different ways:
 *
 *  - Exact duplicates: same file size AND same pixel dimensions, a
 *    strong signal that catches the same photo saved twice from
 *    different apps (e.g. WhatsApp), regardless of when each copy was
 *    taken/saved.
 *  - Burst clusters: photos shot within a few seconds of each other —
 *    an honest, cheap proxy for near-duplicates (several attempts at the
 *    same shot) without claiming to compare actual image content.
 *  - Perceptual similarity: a difference hash (dHash) comparing rough
 *    visual similarity, not exact pixels — catches near-duplicates the
 *    other two signals miss (a retake, a minor edit), at the cost of
 *    occasionally flagging genuinely different but visually similar
 *    photos. That tradeoff is exactly what issue #10 is worried about,
 *    which is why it's unioned with (not the sole authority over) the
 *    other two signals rather than trusted alone. Photos only, since the
 *    hash comes from decoded image pixels — videos still participate in
 *    the other two signals unchanged.
 *
 * A photo only needs to match one signal to show up here; the three id
 * sets are unioned, not intersected. Sources its own photos+videos
 * dataset via getAllMedia(), like Big Files and Short Videos, since
 * exact-duplicate detection needs videos too.
 */
export class DuplicatesAndSimilarStrategy extends CategoryStrategy {
  async matchCandidates(_assets: Asset[]): Promise<Asset[]> {
    const media = await PhotoLibraryService.getAllMedia();

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
    const analysis = await analyzeImages(photos);
    const hashed = photos
      .map((asset) => ({ asset, hash: analysis.get(asset.id)?.dHash }))
      .filter((entry): entry is { asset: Asset; hash: string } => entry.hash !== undefined);

    // O(n^2) pairwise comparison. At the library's real cap (getAllMedia
    // defaults to 500), that's at most ~125k comparisons, each a couple
    // of integer XOR+popcount ops — a few ms, not worth an
    // approximate-nearest-neighbor index at this scale.
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
}
