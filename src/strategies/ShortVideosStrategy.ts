import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

const DEFAULT_MIN_SECONDS = 0;
const DEFAULT_MAX_SECONDS = 3;

/**
 * Accidental pocket-recordings and "oops I hit record" clips — unlike
 * Blurred Photos, there's no judgment call here: duration is objective
 * metadata, so this is as trustworthy as Screenshots. Needs videos, so
 * it sources its own dataset via getAllMedia() like Big Files does.
 */
export class ShortVideosStrategy extends CategoryStrategy {
  minSeconds: number;
  maxSeconds: number;

  constructor(minSeconds = DEFAULT_MIN_SECONDS, maxSeconds = DEFAULT_MAX_SECONDS) {
    super();
    this.minSeconds = minSeconds;
    this.maxSeconds = maxSeconds;
  }

  async match(_assets: Asset[]): Promise<Asset[]> {
    const media = await PhotoLibraryService.getAllMedia();
    return media.filter(
      (asset) =>
        asset.mediaType === 'video' &&
        asset.duration >= this.minSeconds &&
        asset.duration <= this.maxSeconds
    );
  }

  get meta(): CategoryMeta {
    return {
      id: 'short-videos',
      title: i18n.t('categories.short-videos'),
      icon: 'timer-outline',
    };
  }
}
