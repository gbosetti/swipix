import * as MediaLibrary from 'expo-media-library';
import { Asset } from '../types';

/**
 * Single source of truth for reading the device photo library.
 *
 * Reusability rule: nowhere else in the app should import
 * `expo-media-library` directly. If Apple/Expo ever changes this API,
 * or you swap to a different library, this is the ONLY file that changes.
 * Every Strategy and Screen depends on this abstraction, not on the
 * concrete library (Dependency Inversion).
 */
export const PhotoLibraryService = {
  async requestPermission(): Promise<boolean> {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    return status === 'granted';
  },

  async getAllPhotos({ first = 500 }: { first?: number } = {}): Promise<Asset[]> {
    return this._fetchAssets('photo', first);
  },

  /** Photos and videos together — only categories that genuinely need
   * videos (e.g. Big Files) should use this; everything else stays on
   * getAllPhotos so existing categories are unaffected. */
  async getAllMedia({ first = 500 }: { first?: number } = {}): Promise<Asset[]> {
    return this._fetchAssets(['photo', 'video'], first);
  },

  async _fetchAssets(
    mediaType: MediaLibrary.MediaTypeValue | MediaLibrary.MediaTypeValue[],
    first: number
  ): Promise<Asset[]> {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType,
      first,
      sortBy: [MediaLibrary.SortBy.creationTime],
    });

    // Enrich with full info (location, exif) — normalize the shape here
    // so the rest of the app never has to know about MediaLibrary's raw format.
    const detailed: (Asset | null)[] = await Promise.all(
      page.assets.map(async (asset): Promise<Asset | null> => {
        const info = await MediaLibrary.getAssetInfoAsync(asset);
        // asset.uri is a ph:// reference on iOS, not directly renderable by
        // <Image> — localUri is the actual displayable file URI. If it's
        // unavailable (e.g. an iCloud asset that failed to download), skip
        // the asset entirely rather than handing back an unusable ph:// URI
        // that would crash the image loader downstream.
        if (!info.localUri) return null;
        return {
          id: asset.id,
          uri: info.localUri,
          mediaType: asset.mediaType === 'video' ? 'video' : 'photo',
          creationTime: asset.creationTime,
          mediaSubtypes: info.mediaSubtypes ?? [],
          location: info.location ?? null,
        };
      })
    );

    return detailed.filter((asset): asset is Asset => asset !== null);
  },

  /** Permanently deletes assets from the device photo library. iOS/Android
   * both show their own native confirmation dialog before this completes.
   * Throws if the user cancels that dialog or the deletion otherwise fails,
   * so callers never mistake a cancelled deletion for a successful one. */
  async deleteAssets(assetIds: string[]): Promise<void> {
    const success = await MediaLibrary.deleteAssetsAsync(assetIds);
    if (!success) {
      throw new Error('Deletion was cancelled or failed');
    }
  },
};
