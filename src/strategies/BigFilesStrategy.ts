import { File } from 'expo-file-system';
import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta } from '../types';

const DEFAULT_THRESHOLD_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * Large files are usually videos, not photos — this is the one category
 * that needs the broader photos+videos fetch, so unlike every other
 * strategy here it sources its own dataset via getAllMedia() rather than
 * filtering whatever SwipeScreen already fetched (which is photo-only).
 */
export class BigFilesStrategy extends CategoryStrategy {
  thresholdBytes: number;

  constructor(thresholdBytes = DEFAULT_THRESHOLD_BYTES) {
    super();
    this.thresholdBytes = thresholdBytes;
  }

  async match(_assets: Asset[]): Promise<Asset[]> {
    const media = await PhotoLibraryService.getAllMedia();
    return media.filter((asset) => new File(asset.uri).size >= this.thresholdBytes);
  }

  get meta(): CategoryMeta {
    return {
      id: 'big-files',
      title: 'Big Files',
      icon: 'archive',
    };
  }
}
