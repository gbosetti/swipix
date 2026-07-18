import { File } from 'expo-file-system';
import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

const DEFAULT_MIN_BYTES = 20 * 1024 * 1024; // 20 MB
const DEFAULT_MAX_BYTES = 200 * 1024 * 1024; // 200 MB

/**
 * Large photos specifically — split out from the old combined "Big
 * Files" category so photos and videos get their own size range and
 * their own place in the list (Pictures vs Videos section) instead of
 * one generic bucket that could silently be either.
 */
export class BigPicturesStrategy extends CategoryStrategy {
  minBytes: number;
  maxBytes: number;

  constructor(minBytes = DEFAULT_MIN_BYTES, maxBytes = DEFAULT_MAX_BYTES) {
    super();
    this.minBytes = minBytes;
    this.maxBytes = maxBytes;
  }

  async matchCandidates(_assets: Asset[]): Promise<Asset[]> {
    const media = await PhotoLibraryService.getAllMedia();
    return media.filter((asset) => {
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
}
