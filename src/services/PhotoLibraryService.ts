import * as MediaLibrary from 'expo-media-library';
import { getInfoAsync } from 'expo-file-system/legacy';
import { Linking } from 'react-native';
import { Asset, MediaTypeFilter, ScanProgressCallback } from '../types';

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
// prefetched, so raising this doesn't buy real parallelism — it just lets
// more calls fight over the same thread. Kept low deliberately: at 30, a
// ~25-item CategoryPickerScreen preview burst (Big Pictures + Big Videos +
// Duplicates) never even fills the cap, so nothing waits in the priority
// queue below for an active swipe session's 'high' request to jump ahead
// of — confirmed on a real device, this alone caused an 11s wait for the
// first progress-bar update. A lower cap throttles that burst into
// smaller waves, leaving room for priority to actually matter.
const ASSET_INFO_CONCURRENCY = 8;

// A sandbox-denied asset can retry internally rather than rejecting
// quickly — bounds one getAssetInfoAsync call, and skips a known-bad
// asset entirely on later fetches instead of relaunching it fresh.
const ASSET_INFO_TIMEOUT_MS = 4000;
// The page-level query itself, not any one asset — a real, if rare,
// native hang here previously had no bound at all, and unlike a single
// asset's lookup, this one blocks the *entire* fetch (nothing to skip and
// move past). Confirmed as a real cause of a swipe session getting stuck
// with no error and no recovery: the caller's own promise chain simply
// never resolved, so nothing downstream (retry, "finished", anything)
// ever ran. More generous than ASSET_INFO_TIMEOUT_MS since it covers a
// whole page, not one item.
const PAGE_FETCH_TIMEOUT_MS = 8000;
const knownFailedAssetIds = new Set<string>();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Native call timed out'));
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

// Global, not per-call — every getAssetInfoAsync lands on the same iOS main
// thread regardless of which call issued it, so several independent
// ASSET_INFO_CONCURRENCY-wide batches at once still add up to real contention.
let activeNativeCalls = 0;
const pendingNativeCalls: (() => void)[] = [];

type CallPriority = 'high' | 'low';

// 'high' jumps the queue ahead of already-waiting 'low' requests — an
// active swipe session's own fetch shouldn't queue behind CategoryPicker-
// Screen's background preview work just because the preview requests
// happened to arrive first.
function acquireNativeCallSlot(priority: CallPriority): Promise<void> {
  if (activeNativeCalls < ASSET_INFO_CONCURRENCY) {
    activeNativeCalls++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const job = () => {
      activeNativeCalls++;
      resolve();
    };
    if (priority === 'high') {
      pendingNativeCalls.unshift(job);
    } else {
      pendingNativeCalls.push(job);
    }
  });
}

function releaseNativeCallSlot(): void {
  activeNativeCalls--;
  const next = pendingNativeCalls.shift();
  if (next) next();
}

async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  priority: CallPriority = 'low'
): Promise<R[]> {
  return Promise.all(
    items.map(async (item) => {
      await acquireNativeCallSlot(priority);
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

  /**
   * Lets the user change which photos/videos the app can see. Opens the
   * app's system Settings page directly rather than the OS's in-app
   * limited-access picker — the picker only lets the user add/remove
   * individually-selected items, it has no "Allow all photos" option, and
   * that's what people reaching for this actually want.
   */
  async manageLibraryAccess(): Promise<void> {
    await Linking.openSettings();
  },

  /**
   * Detailed fetch — resolves every asset's real file path up front, for
   * callers that read file size or decode pixels off `asset.uri`.
   */
  async getAllPhotos({
    first = 500,
    onProgress,
    priority,
  }: {
    first?: number;
    onProgress?: ScanProgressCallback;
    /**
     * 'high' for an active swipe session; defaults to 'low' (background
     * preview work) — see {@link CallPriority}.
     */
    priority?: CallPriority;
  } = {}): Promise<Asset[]> {
    return (await this._fetchAssets('photo', first, undefined, true, undefined, onProgress, priority)).assets;
  },

  /**
   * Photos and videos together, detailed. Only for categories that
   * genuinely need videos — everything else stays on {@link getAllPhotos}.
   */
  async getAllMedia({
    first = 500,
    onProgress,
    priority,
    isCancelled,
  }: {
    first?: number;
    onProgress?: ScanProgressCallback;
    priority?: CallPriority;
    isCancelled?: () => boolean;
  } = {}): Promise<Asset[]> {
    return (
      await this._fetchAssets(
        ['photo', 'video'],
        first,
        undefined,
        true,
        undefined,
        onProgress,
        priority,
        isCancelled
      )
    ).assets;
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
    onProgress,
    priority,
    isCancelled,
  }: {
    mediaTypes: MediaTypeFilter[];
    first: number;
    after?: string;
    /** True for a strategy whose `needsDetailedFetch` is set (Big Pictures/Videos). */
    detailed?: boolean;
    /** Scopes the fetch to one native album — see `CategoryStrategy.albumId`. */
    albumId?: string;
    /** Only meaningful when `detailed` — the light path resolves near-instantly. */
    onProgress?: ScanProgressCallback;
    /** 'high' for an active swipe session; defaults to 'low'. */
    priority?: CallPriority;
    /**
     * Checked before each item still waiting for a concurrency slot —
     * an item that hasn't started yet skips its native call entirely once
     * this returns true, instead of occupying a slot a still-active
     * caller needs. Can't stop an item's call that's already dispatched.
     */
    isCancelled?: () => boolean;
  }): Promise<AssetPage> {
    const type = mediaTypes.length === 1 ? mediaTypes[0] : mediaTypes;
    return this._fetchAssets(
      type,
      first,
      after,
      detailed,
      albumId ? { albumId } : undefined,
      onProgress,
      priority,
      isCancelled
    );
  },

  /**
   * Small, targeted fetch for one category's own preview lookup — newest
   * first, with optional native filters so a strategy can ask the OS
   * directly instead of scanning a shared sample. `first` defaults to a
   * handful so already-decided assets can be skipped locally.
   */
  async getPreviewCandidates({
    mediaTypes,
    mediaSubtypes,
    createdAfter,
    createdBefore,
    albumId,
    first = 5,
    detailed = false,
    priority,
    isCancelled,
  }: {
    mediaTypes: MediaTypeFilter[];
    mediaSubtypes?: MediaLibrary.MediaSubtype[];
    createdAfter?: Date;
    createdBefore?: Date;
    albumId?: string;
    first?: number;
    detailed?: boolean;
    /**
     * 'high' for an active swipe session; defaults to 'low' — see
     * {@link CallPriority}.
     */
    priority?: CallPriority;
    isCancelled?: () => boolean;
  }): Promise<Asset[]> {
    const type = mediaTypes.length === 1 ? mediaTypes[0] : mediaTypes;
    const page = await this._fetchAssets(
      type,
      first,
      undefined,
      detailed,
      { mediaSubtypes, createdAfter, createdBefore, albumId },
      undefined,
      priority,
      isCancelled
    );
    return page.assets;
  },

  /**
   * Total photo+video count in the library — a `first: 1` query costs one
   * cheap native call and no per-item work; only `totalCount` off the
   * response is used. Lets a caller decide whether a real per-item scan
   * (e.g. a Duplicates/Big Pictures/Big Videos preview) is worth
   * attempting at all before starting one.
   */
  async getLibrarySize(): Promise<number> {
    const page = await withTimeout(
      MediaLibrary.getAssetsAsync({ mediaType: ['photo', 'video'], first: 1 }),
      PAGE_FETCH_TIMEOUT_MS
    );
    return page.totalCount;
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

  /**
   * One combined photo+video fetch, pre-split by media type — avoids
   * duplicating that split logic at every caller that needs both.
   */
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
    filters?: AssetFilters,
    onProgress?: ScanProgressCallback,
    priority?: CallPriority,
    isCancelled?: () => boolean
  ): Promise<AssetPage> {
    const key = JSON.stringify({ mediaType, first, after: after ?? null, detailed, filters: filters ?? null });
    const existing = inFlight.get(key);
    // A second caller sharing this in-flight promise won't see its own
    // onProgress fire, and its isCancelled won't be checked either —
    // acceptable, same as onProgress: a UI/resource-hygiene nicety, not
    // something correctness depends on.
    if (existing) return existing;
    let evictionTimer: ReturnType<typeof setTimeout>;
    const promise = this._fetchAssetsUncached(
      mediaType,
      first,
      after,
      detailed,
      filters,
      onProgress,
      priority,
      isCancelled
    ).finally(() => {
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
    filters?: AssetFilters,
    onProgress?: ScanProgressCallback,
    priority: CallPriority = 'low',
    isCancelled?: () => boolean
  ): Promise<AssetPage> {
    const page = await withTimeout(
      MediaLibrary.getAssetsAsync({
        mediaType,
        first,
        after,
        sortBy: [MediaLibrary.SortBy.creationTime],
        ...(filters?.mediaSubtypes ? { mediaSubtypes: filters.mediaSubtypes } : {}),
        ...(filters?.createdAfter ? { createdAfter: filters.createdAfter } : {}),
        ...(filters?.createdBefore ? { createdBefore: filters.createdBefore } : {}),
        ...(filters?.albumId ? { album: filters.albumId } : {}),
      }),
      PAGE_FETCH_TIMEOUT_MS
    );

    // info.location (GPS) is deliberately never mapped onto Asset — nothing
    // in the app reads it, and data minimization rules out capturing it.
    let doneCount = 0;
    const total = page.assets.length;
    // Fired before any item starts, not just as each one finishes — a
    // 'high' request can still queue behind an already-saturated pool, so
    // waiting for the first completion could show nothing for seconds.
    if (total > 0) onProgress?.(0, total);
    const detailedAssets: (Asset | null)[] = await mapWithConcurrency(
      page.assets,
      async (asset): Promise<Asset | null> => {
        try {
          // Checked after acquiring a slot, not just once up front — an
          // abandoned page fetch (user left mid-scan) still has to let
          // items already dispatched finish, but one not yet started has
          // no reason to make its own real native call and occupy a slot
          // a newly-active session actually needs. Confirmed on a real
          // device: without this, leaving a slow scan mid-flight (Big
          // Pictures) could hold the whole concurrency pool hostage for
          // as long as its abandoned page took to fully drain, starving a
          // freshly-opened swipe session even with 'high' priority —
          // priority only reorders the wait queue, it can't preempt slots
          // already held by unrelated, uncancellable in-flight work.
          if (isCancelled?.()) return null;
          const isVideo = asset.mediaType === 'video';
          // Light path: skip getAssetInfoAsync and hand back the raw ph://
          // URI. For photos this is just the fast path — expo-image
          // resolves ph:// lazily, off the main thread. For videos it's
          // not optional: expo-video's own docs say never to use
          // getAssetInfoAsync's localUri for playback — on a real device,
          // iOS's sandbox denied mediaserverd read access to it for a
          // large fraction of ordinary, non-broken videos (a known
          // expo-media-library issue, not specific to any one file).
          // ph:// is the URI expo-video actually supports.
          if (!detailed) {
            return {
              id: asset.id,
              uri: asset.uri,
              mediaType: isVideo ? 'video' : 'photo',
              creationTime: asset.creationTime,
              duration: asset.duration,
              width: asset.width,
              height: asset.height,
              mediaSubtypes: asset.mediaSubtypes ?? [],
            };
          }
          // Skip immediately for an asset already known to fail this
          // session — see ASSET_INFO_TIMEOUT_MS's comment.
          if (knownFailedAssetIds.has(asset.id)) return null;
          // Skip this one asset rather than reject the whole page — a real
          // library is likely to have at least one asset getAssetInfoAsync
          // rejects on (iCloud-only, unusual metadata, etc.), or that hangs
          // long enough to be worth bounding on its own.
          let info: MediaLibrary.AssetInfo;
          try {
            info = await withTimeout(MediaLibrary.getAssetInfoAsync(asset), ASSET_INFO_TIMEOUT_MS);
          } catch {
            knownFailedAssetIds.add(asset.id);
            return null;
          }
          // localUri can be missing (e.g. an iCloud asset that failed to
          // download) — skip rather than hand back an unusable reference.
          if (!info.localUri) return null;
          return {
            id: asset.id,
            // Still the raw ph:// reference for a video's playback uri —
            // only file-size-reading callers need the resolved path,
            // carried separately in localUri (see the Asset type).
            uri: isVideo ? asset.uri : info.localUri,
            localUri: isVideo ? info.localUri : undefined,
            mediaType: isVideo ? 'video' : 'photo',
            creationTime: asset.creationTime,
            duration: asset.duration,
            width: asset.width,
            height: asset.height,
            mediaSubtypes: info.mediaSubtypes ?? [],
          };
        } finally {
          doneCount++;
          onProgress?.(doneCount, total);
        }
      },
      priority
    );

    return {
      assets: detailedAssets.filter((asset): asset is Asset => asset !== null),
      endCursor: page.endCursor,
      hasNextPage: page.hasNextPage,
    };
  },

  /**
   * File size in bytes for a resolved local `uri` — never `new
   * File(uri).size`, which is a synchronous native call that blocks the
   * JS thread on real disk I/O.
   *
   * @remarks
   * Confirmed on a real device: Big Pictures/Videos and Duplicates &
   * Similar doing that synchronously over dozens of items froze the
   * whole UI, including touch handling, for as long as the loop ran.
   * Shares the same concurrency/priority pool as the detailed asset
   * fetch above so it doesn't introduce a second, uncoordinated source
   * of native contention. Bounded by the same timeout as
   * getAssetInfoAsync — without it, one stuck filesystem call (an
   * iCloud-only asset, a sandbox hiccup) holds its concurrency slot
   * forever; confirmed on a real device that a handful of these stuck
   * calls, accumulated while paging through a sparse category like Big
   * Pictures, was enough to starve the whole pool for minutes, including
   * unrelated work queued behind it (e.g. Categories' own video previews).
   */
  async getFileSize(
    uri: string,
    { priority, isCancelled }: { priority?: CallPriority; isCancelled?: () => boolean } = {}
  ): Promise<number> {
    await acquireNativeCallSlot(priority ?? 'low');
    try {
      if (isCancelled?.()) return 0;
      const info = await withTimeout(getInfoAsync(uri), ASSET_INFO_TIMEOUT_MS);
      return info.exists ? info.size : 0;
    } catch {
      return 0;
    } finally {
      releaseNativeCallSlot();
    }
  },

  /**
   * A real local `file://` path for handing this one asset to the OS
   * share sheet — resolved on demand (never pre-fetched or cached), since
   * sharing is a rare, one-off user action, not something worth resolving
   * for every card in a deck.
   *
   * @remarks
   * Deliberately not the same field a swipe session already has on
   * `Asset.uri` for a video: that's kept as the raw `ph://` reference
   * because expo-video's own docs say never to hand `localUri` to a
   * player (see the Asset type). The OS share sheet has the opposite
   * requirement — it needs real file bytes, not a Photos-library
   * reference — so this resolves fresh via getAssetInfoAsync regardless
   * of what `uri` already holds.
   */
  async getShareableUri(assetId: string): Promise<string | null> {
    await acquireNativeCallSlot('high');
    try {
      const info = await withTimeout(MediaLibrary.getAssetInfoAsync(assetId), ASSET_INFO_TIMEOUT_MS);
      return info.localUri ?? null;
    } catch {
      return null;
    } finally {
      releaseNativeCallSlot();
    }
  },

  /**
   * Permanently deletes assets. The OS shows its own confirmation dialog
   * first; throws if the user cancels, so callers never mistake a
   * cancelled deletion for a successful one.
   */
  async deleteAssets(assetIds: string[]): Promise<void> {
    const success = await MediaLibrary.deleteAssetsAsync(assetIds);
    if (!success) {
      throw new Error('Deletion was cancelled or failed');
    }
  },
};
