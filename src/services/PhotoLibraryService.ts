import * as MediaLibrary from 'expo-media-library';
import { Asset, MediaTypeFilter } from '../types';

type AssetPage = { assets: Asset[]; endCursor: string; hasNextPage: boolean };
type AssetFilters = {
  mediaSubtypes?: MediaLibrary.MediaSubtype[];
  createdAfter?: Date;
  createdBefore?: Date;
  albumId?: string;
};
export type Album = { id: string; title: string; assetCount: number };

// De-dupes identical concurrent fetches — CategoryPickerScreen fires several
// strategies' preview lookups at once, some with byte-for-byte identical params.
const inFlight = new Map<string, Promise<AssetPage>>();

// Safety net for a native call that never settles at all (seen after a large
// deletion, while iOS's Photos index is still updating) — `.finally()` below
// never fires for those, so this key would otherwise stay poisoned forever.
const CACHE_EVICTION_MS = 15000;

// getAssetInfoAsync resolves synchronously on iOS's main thread when not
// prefetched. Unbounded concurrency on a large page can trip iOS's hang
// watchdog and silently kill the app. Only applies to "detailed" fetches.
const ASSET_INFO_CONCURRENCY = 30;

// Global, not per-call — every getAssetInfoAsync lands on the same iOS main
// thread regardless of which call issued it, so several independent
// ASSET_INFO_CONCURRENCY-wide batches at once still add up to real contention.
let activeNativeCalls = 0;
const pendingNativeCalls: (() => void)[] = [];

function acquireNativeCallSlot(): Promise<void> {
  if (activeNativeCalls < ASSET_INFO_CONCURRENCY) {
    activeNativeCalls++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    pendingNativeCalls.push(() => {
      activeNativeCalls++;
      resolve();
    });
  });
}

function releaseNativeCallSlot(): void {
  activeNativeCalls--;
  const next = pendingNativeCalls.shift();
  if (next) next();
}

async function mapWithConcurrency<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  return Promise.all(
    items.map(async (item) => {
      await acquireNativeCallSlot();
      try {
        return await fn(item);
      } finally {
        releaseNativeCallSlot();
      }
    })
  );
}

/**
 * Single source of truth for reading the device photo library.
 *
 * @remarks
 * Nowhere else should import `expo-media-library` directly — every
 * Strategy and Screen depends on this abstraction, not the concrete library.
 */
export const PhotoLibraryService = {
  async requestPermission(): Promise<boolean> {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    return status === 'granted';
  },

  /** Detailed fetch — resolves every asset's real file path up front, for
   * callers that read file size or decode pixels off `asset.uri`. */
  async getAllPhotos({ first = 500 }: { first?: number } = {}): Promise<Asset[]> {
    return (await this._fetchAssets('photo', first, undefined, true)).assets;
  },

  /** Photos and videos together, detailed. Only for categories that
   * genuinely need videos — everything else stays on {@link getAllPhotos}. */
  async getAllMedia({ first = 500 }: { first?: number } = {}): Promise<Asset[]> {
    return (await this._fetchAssets(['photo', 'video'], first, undefined, true)).assets;
  },

  /**
   * Live-browsing pagination for the Swipe deck and Categories previews —
   * not detailed, so it only returns something renderable, not a real file
   * path.
   *
   * @remarks
   * `after` is supported but SwipeScreen never passes it: expo-media-library's
   * iOS cursor resolution isn't reliable when assets tie on the sort key, so
   * SwipeScreen grows `first` itself instead and slices off the new tail.
   */
  async getMediaPage({
    mediaTypes,
    first,
    after,
    detailed = false,
    albumId,
  }: {
    mediaTypes: MediaTypeFilter[];
    first: number;
    after?: string;
    /** True for a strategy whose `needsDetailedFetch` is set (Big Pictures/Videos). */
    detailed?: boolean;
    /** Scopes the fetch to one native album — see `CategoryStrategy.albumId`. */
    albumId?: string;
  }): Promise<AssetPage> {
    const type = mediaTypes.length === 1 ? mediaTypes[0] : mediaTypes;
    return this._fetchAssets(type, first, after, detailed, albumId ? { albumId } : undefined);
  },

  /** Small, targeted fetch for one category's own preview lookup — newest
   * first, with optional native filters so a strategy can ask the OS
   * directly instead of scanning a shared sample. `first` defaults to a
   * handful so already-decided assets can be skipped locally. */
  async getPreviewCandidates({
    mediaTypes,
    mediaSubtypes,
    createdAfter,
    createdBefore,
    albumId,
    first = 5,
    detailed = false,
  }: {
    mediaTypes: MediaTypeFilter[];
    mediaSubtypes?: MediaLibrary.MediaSubtype[];
    createdAfter?: Date;
    createdBefore?: Date;
    albumId?: string;
    first?: number;
    detailed?: boolean;
  }): Promise<Asset[]> {
    const type = mediaTypes.length === 1 ? mediaTypes[0] : mediaTypes;
    const page = await this._fetchAssets(type, first, undefined, detailed, {
      mediaSubtypes,
      createdAfter,
      createdBefore,
      albumId,
    });
    return page.assets;
  },

  /**
   * User-created albums containing at least one asset of `mediaType` —
   * excludes iOS's auto-generated Moments and smart albums.
   *
   * @remarks
   * An album's own `assetCount` covers all media types combined, so a
   * video-only album would otherwise show up in the photo picker with
   * nothing for AlbumStrategy to find — each album's real per-type count is
   * queried directly and reused as the returned `assetCount`.
   */
  async getAlbums(mediaType: MediaTypeFilter): Promise<Album[]> {
    const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: false });
    const userAlbums = albums.filter((album) => (album.type ?? 'album') === 'album' && album.assetCount > 0);
    const withTypeCounts = await mapWithConcurrency(userAlbums, async (album) => {
      const page = await MediaLibrary.getAssetsAsync({ album: album.id, mediaType, first: 1 });
      return { id: album.id, title: album.title, assetCount: page.totalCount };
    });
    return withTypeCounts
      .filter((album) => album.assetCount > 0)
      .sort((a, b) => a.title.localeCompare(b.title));
  },

  /** One combined photo+video fetch, pre-split by media type — avoids
   * duplicating that split logic at every caller that needs both. */
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
    after?: string,
    detailed = true,
    filters?: AssetFilters
  ): Promise<AssetPage> {
    const key = JSON.stringify({ mediaType, first, after: after ?? null, detailed, filters: filters ?? null });
    const existing = inFlight.get(key);
    if (existing) return existing;
    let evictionTimer: ReturnType<typeof setTimeout>;
    const promise = this._fetchAssetsUncached(mediaType, first, after, detailed, filters).finally(() => {
      clearTimeout(evictionTimer);
      inFlight.delete(key);
    });
    inFlight.set(key, promise);
    evictionTimer = setTimeout(() => {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    }, CACHE_EVICTION_MS);
    return promise;
  },

  async _fetchAssetsUncached(
    mediaType: MediaLibrary.MediaTypeValue | MediaLibrary.MediaTypeValue[],
    first: number,
    after: string | undefined,
    detailed: boolean,
    filters?: AssetFilters
  ): Promise<AssetPage> {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType,
      first,
      after,
      sortBy: [MediaLibrary.SortBy.creationTime],
      ...(filters?.mediaSubtypes ? { mediaSubtypes: filters.mediaSubtypes } : {}),
      ...(filters?.createdAfter ? { createdAfter: filters.createdAfter } : {}),
      ...(filters?.createdBefore ? { createdBefore: filters.createdBefore } : {}),
      ...(filters?.albumId ? { album: filters.albumId } : {}),
    });

    // info.location (GPS) is deliberately never mapped onto Asset — nothing
    // in the app reads it, and data minimization rules out capturing it.
    const detailedAssets: (Asset | null)[] = await mapWithConcurrency(
      page.assets,
      async (asset): Promise<Asset | null> => {
        // Light path: photos skip getAssetInfoAsync and hand back the raw
        // ph:// URI — expo-image's native loader resolves those lazily,
        // off the main thread. Videos always resolve regardless of
        // `detailed`: expo-video needs a real playable file path.
        if (!detailed && asset.mediaType !== 'video') {
          return {
            id: asset.id,
            uri: asset.uri,
            mediaType: 'photo',
            creationTime: asset.creationTime,
            duration: asset.duration,
            width: asset.width,
            height: asset.height,
            mediaSubtypes: asset.mediaSubtypes ?? [],
          };
        }
        // Skip this one asset rather than reject the whole page — a real
        // library is likely to have at least one asset getAssetInfoAsync
        // rejects on (iCloud-only, unusual metadata, etc.).
        let info: MediaLibrary.AssetInfo;
        try {
          info = await MediaLibrary.getAssetInfoAsync(asset);
        } catch {
          return null;
        }
        // localUri can be missing (e.g. an iCloud asset that failed to
        // download) — skip rather than hand back an unusable ph:// URI.
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
      assets: detailedAssets.filter((asset): asset is Asset => asset !== null),
      endCursor: page.endCursor,
      hasNextPage: page.hasNextPage,
    };
  },

  /** Permanently deletes assets. The OS shows its own confirmation dialog
   * first; throws if the user cancels, so callers never mistake a
   * cancelled deletion for a successful one. */
  async deleteAssets(assetIds: string[]): Promise<void> {
    const success = await MediaLibrary.deleteAssetsAsync(assetIds);
    if (!success) {
      throw new Error('Deletion was cancelled or failed');
    }
  },
};
