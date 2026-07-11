import { CategoryStrategy } from './CategoryStrategy';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

const BURST_WINDOW_MS = 3 * 1000; // photos this close together are probably a burst

/**
 * No real image similarity here — that needs perceptual hashing on pixel
 * data, a much bigger lift (see the "Same Person" milestone we cut for
 * the same reason). This is an honest, cheap proxy instead: photos shot
 * within a few seconds of each other are very likely near-duplicates
 * (burst mode, several attempts at the same shot), without ever claiming
 * to compare actual image content.
 */
export class SimilarPicturesStrategy extends CategoryStrategy {
  async match(assets: Asset[]): Promise<Asset[]> {
    const sorted = [...assets].sort((a, b) => a.creationTime - b.creationTime);
    const clusters: Asset[][] = [];

    for (const asset of sorted) {
      const currentCluster = clusters[clusters.length - 1];
      const lastInCluster = currentCluster?.[currentCluster.length - 1];
      if (lastInCluster && asset.creationTime - lastInCluster.creationTime <= BURST_WINDOW_MS) {
        currentCluster.push(asset);
      } else {
        clusters.push([asset]);
      }
    }

    return clusters.filter((cluster) => cluster.length >= 2).flat();
  }

  get meta(): CategoryMeta {
    return {
      id: 'similar-pictures',
      title: i18n.t('categories.similar-pictures'),
      icon: 'copy',
    };
  }
}
