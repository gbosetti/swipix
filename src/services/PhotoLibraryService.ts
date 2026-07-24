import * as MediaLibrary from 'expo-media-library';
import { Asset, MediaTypeFilter } from '../types';

type AssetPage = { assets: Asset[]; endCursor: string; hasNextPage: boolean };

// Single-flight de-dupe: CategoryPickerScreen mounts and immediately fires
// several strategies' preview computation in a row, and multiple
// "self-fetching" strategies (MonthYear, Duplicates, Big Files, etc.) each
// independently call getAllMedia() with byte-for-byte identical params —
// without this, that's up to 9 fully redundant concurrent fetches of the
// same 500 assets. Keyed by exact fetch params; an entry is removed the
// instant its promise settles, so this only coalesces genuinely-concurrent
// identical requests and never serves stale data to a later, separate call.
const inFlight = new Map<string, Promise<AssetPage>>();

// Confirmed via a real-device crash: MediaLibrary.getAssetInfoAsync isn't
// as cheap as it looks — when an asset's properties weren't already
// prefetched by getAssetsAsync, iOS resolves them synchronously on the
// MAIN THREAD (logged as "Missing prefetched properties... Fetching on
// demand on the main queue"). Firing all of a page's calls at once via a
// flat Promise.all (as this used to) floods the main thread badly enough,
// for a large page (e.g. DuplicatesAndSimilarStrategy's self-fetched 500),
// to trip iOS's hang watchdog and get the whole app force-killed — with no
// crash report, since it's a watchdog kill, not a memory/segfault crash.
// Bounding concurrency, the same way ImageAnalysisService already bounds
// concurrent image decodes, keeps the main thread responsive regardless of
// page size. 30 is a deliberate middle ground: SwipeScreen/CategoryPickerScreen
// pages (60/150 assets) stay close to fully parallel — they were never the
// crash trigger — while a 500-asset self-fetch (DuplicatesAndSimilarStrategy)
// still gets spread over ~17 batches instead of flooding the main thread in
// one shot. An earlier, more conservative value (12) fixed the crash but
// made every page noticeably slower, including ones that were never at risk.
const ASSET_INFO_CONCURRENCY = 30;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

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
    return (await this._fetchAssets('photo', first)).assets;
  },

  /** Photos and videos together — only categories that genuinely need
   * videos (e.g. Big Files) should use this; everything else stays on
   * getAllPhotos so existing categories are unaffected. */
  async getAllMedia({ first = 500 }: { first?: number } = {}): Promise<Asset[]> {
    return (await this._fetchAssets(['photo', 'video'], first)).assets;
  },

  /** Cursor-paginated fetch — lets a caller load a small first page fast,
   * then fetch further pages on demand, instead of resolving hundreds of
   * assets' detail up front (see SwipeScreen, which uses this to avoid a
   * multi-second stall on large libraries). `after` is the previous page's
   * `endCursor`; omit it for the first page. `mediaTypes` mirrors
   * CategoryStrategy.mediaTypes, so a caller can ask for exactly what the
   * active strategy needs. */
  async getMediaPage({
    mediaTypes,
    first,
    after,
  }: {
    mediaTypes: MediaTypeFilter[];
    first: number;
    after?: string;
  }): Promise<AssetPage> {
    const type = mediaTypes.length === 1 ? mediaTypes[0] : mediaTypes;
    return this._fetchAssets(type, first, after);
  },

  /** Same one combined `getMediaPage(['photo','video'])` fetch a caller
   * needing both photo and video previews from a single shared window
   * would otherwise have to split by hand (see CategoryPickerScreen) —
   * done here once so that logic isn't duplicated at every call site. */
  async getSplitMediaPage({
    first,
    after,
  }: {
    first: number;
    after?: string;
  }): Promise<{ photos: Asset[]; videos: Asset[]; endCursor: string; hasNextPage: boolean }> {
    const page = await this.getMediaPage({ mediaTypes: ['photo', 'video'], first, after });
    return {
      photos: page.assets.filter((asset) => asset.mediaType === 'photo'),
      videos: page.assets.filter((asset) => asset.mediaType === 'video'),
      endCursor: page.endCursor,
      hasNextPage: page.hasNextPage,
    };
  },

  async _fetchAssets(
    mediaType: MediaLibrary.MediaTypeValue | MediaLibrary.MediaTypeValue[],
    first: number,
    after?: string
  ): Promise<AssetPage> {
    const key = JSON.stringify({ mediaType, first, after: after ?? null });
    const existing = inFlight.get(key);
    if (existing) return existing;
    const promise = this._fetchAssetsUncached(mediaType, first, after).finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, promise);
    return promise;
  },

  async _fetchAssetsUncached(
    mediaType: MediaLibrary.MediaTypeValue | MediaLibrary.MediaTypeValue[],
    first: number,
    after?: string
  ): Promise<AssetPage> {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType,
      first,
      after,
      sortBy: [MediaLibrary.SortBy.creationTime],
    });

    // Enrich with full info — normalize the shape here so the rest of the
    // app never has to know about MediaLibrary's raw format. Deliberately
    // not mapping info.location (GPS coordinates) onto Asset: nothing in
    // the app reads it, and capturing sensitive location data nothing
    // uses is exactly what data-minimization rules out.
    const detailed: (Asset | null)[] = await mapWithConcurrency(
      page.assets,
      ASSET_INFO_CONCURRENCY,
      async (asset): Promise<Asset | null> => {
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
          duration: asset.duration,
          width: asset.width,
          height: asset.height,
          mediaSubtypes: info.mediaSubtypes ?? [],
        };
      }
    );

    return {
      assets: detailed.filter((asset): asset is Asset => asset !== null),
      endCursor: page.endCursor,
      hasNextPage: page.hasNextPage,
    };
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
