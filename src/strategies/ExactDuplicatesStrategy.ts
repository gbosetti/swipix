import { File } from 'expo-file-system';
import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

/**
 * Genuine duplicates — same file size AND same pixel dimensions, a much
 * stronger signal than the burst-timestamp proxy Similar Photos uses.
 * Catches the same photo saved twice from different apps (e.g. WhatsApp),
 * regardless of when each copy was taken/saved. Still not pixel hashing,
 * but exact size+dimension collisions on unrelated photos are very rare.
 * Sources its own photos+videos dataset like Big Files and Short Videos.
 */
export class ExactDuplicatesStrategy extends CategoryStrategy {
  async match(_assets: Asset[]): Promise<Asset[]> {
    const media = await PhotoLibraryService.getAllMedia();
    const groups = new Map<string, Asset[]>();

    for (const asset of media) {
      const size = new File(asset.uri).size;
      const key = `${size}-${asset.width}-${asset.height}`;
      const group = groups.get(key);
      if (group) {
        group.push(asset);
      } else {
        groups.set(key, [asset]);
      }
    }

    return Array.from(groups.values())
      .filter((group) => group.length >= 2)
      .flat();
  }

  get meta(): CategoryMeta {
    return {
      id: 'exact-duplicates',
      title: i18n.t('categories.exact-duplicates'),
      icon: 'layers-outline',
    };
  }
}
