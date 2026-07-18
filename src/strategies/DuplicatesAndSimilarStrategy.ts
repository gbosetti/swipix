import { File } from 'expo-file-system';
import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

const BURST_WINDOW_MS = 3 * 1000; // photos this close together are probably a burst

/**
 * Merges what used to be two separate categories, since to a user
 * they're the same underlying question — "which of these are redundant
 * copies?" — just detected two different ways:
 *
 *  - Exact duplicates: same file size AND same pixel dimensions, a
 *    strong signal that catches the same photo saved twice from
 *    different apps (e.g. WhatsApp), regardless of when each copy was
 *    taken/saved.
 *  - Burst clusters: photos shot within a few seconds of each other —
 *    an honest, cheap proxy for near-duplicates (several attempts at the
 *    same shot) without claiming to compare actual image content.
 *
 * A photo only needs to match one signal to show up here; the two id
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

    const matchedIds = new Set([...exactDuplicateIds, ...burstIds]);
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
