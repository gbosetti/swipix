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
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: 'photo',
      first,
      sortBy: [MediaLibrary.SortBy.creationTime],
    });

    // Enrich with full info (location, exif) — normalize the shape here
    // so the rest of the app never has to know about MediaLibrary's raw format.
    const detailed: Asset[] = await Promise.all(
      page.assets.map(async (asset): Promise<Asset> => {
        const info = await MediaLibrary.getAssetInfoAsync(asset);
        return {
          id: asset.id,
          // asset.uri is a ph:// reference on iOS, not directly renderable —
          // localUri is the actual displayable file URI.
          uri: info.localUri ?? asset.uri,
          creationTime: asset.creationTime,
          mediaSubtypes: info.mediaSubtypes ?? [],
          location: info.location ?? null,
        };
      })
    );

    return detailed;
  },
};
