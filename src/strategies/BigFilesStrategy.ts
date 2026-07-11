import { File } from 'expo-file-system';
import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

const DEFAULT_MIN_BYTES = 20 * 1024 * 1024; // 20 MB
const DEFAULT_MAX_BYTES = 200 * 1024 * 1024; // 200 MB

/**
 * Large files are usually videos, not photos — this is the one category
 * that needs the broader photos+videos fetch, so unlike every other
 * strategy here it sources its own dataset via getAllMedia() rather than
 * filtering whatever SwipeScreen already fetched (which is photo-only).
 */
export class BigFilesStrategy extends CategoryStrategy {
  minBytes: number;
  maxBytes: number;

  constructor(minBytes = DEFAULT_MIN_BYTES, maxBytes = DEFAULT_MAX_BYTES) {
    super();
    this.minBytes = minBytes;
    this.maxBytes = maxBytes;
  }

  async match(_assets: Asset[]): Promise<Asset[]> {
    const media = await PhotoLibraryService.getAllMedia();
    return media.filter((asset) => {
      const size = new File(asset.uri).size;
      return size >= this.minBytes && size <= this.maxBytes;
    });
  }

  get meta(): CategoryMeta {
    return {
      id: 'big-files',
      title: i18n.t('categories.big-files'),
      icon: 'archive',
    };
  }
}
