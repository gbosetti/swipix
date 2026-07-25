import * as MediaLibrary from 'expo-media-library';
import { Asset, MediaTypeFilter } from '../types';

type AssetPage = { assets: Asset[]; endCursor: string; hasNextPage: boolean };
type AssetFilters = {
  mediaSubtypes?: MediaLibrary.MediaSubtype[];
  createdAfter?: Date;
  createdBefore?: Date;
};

// Single-flight de-dupe: CategoryPickerScreen mounts and immediately fires
// several strategies' preview computation in a row, and multiple
// "self-fetching" strategies (MonthYear, Duplicates, Big Files, etc.) each
// independently call getAllMedia() with byte-for-byte identical params —
// without this, that's up to 9 fully redundant concurrent fetches of the
// same 500 assets. Keyed by exact fetch params; an entry is removed the
// instant its promise settles, so this only coalesces genuinely-concurrent
// identical requests and never serves stale data to a later, separate call.
const inFlight = new Map<string, Promise<AssetPage>>();

// A safety net independent of whether the underlying native call ever
// settles. An entry is normally removed the instant its promise settles
// (see the .finally() below) — but if the native call itself hangs and
// never settles at all (confirmed plausible: e.g. right after a large
// native deletion, while iOS's Photos index may still be updating), that
// .finally() never fires either, and this cache key stays poisoned for
// the rest of the app's process lifetime. Every later request with the
// same fetch signature — even a real Swipe session's, not just a
// preview — would then hang on that same dead promise forever,
// indistinguishable from "no matches." getPreview()'s own timeout only
// protects its caller from waiting on this; it doesn't free this cache.
const CACHE_EVICTION_MS = 15000;

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
// page size. Only matters for "detailed" fetches (see `detailed` below) —
// the live-browsing path skips getAssetInfoAsync for photos entirely.
const ASSET_INFO_CONCURRENCY = 30;

// GLOBAL across every call, not scoped to one fetch — confirmed on a real
// device: every category now loads its own preview independently (see
// CategoryStrategy.getPreview), and several of them need a detailed fetch
// at once (Big Pictures, Big Videos, Duplicates & Similar all mounting
// together). Each used to run its own full ASSET_INFO_CONCURRENCY-wide
// batch, but the underlying getAssetInfoAsync calls all still land on the
// SAME iOS main thread regardless of which JS-side batch issued them —
// three batches of 30 is 90 concurrent main-thread hits, not 30. That was
// enough contention to stall even the fast, non-detailed categories past
// their own timeouts, not just the detailed ones. A shared queue, not a
// fresh worker pool per call, keeps the real total bounded everywhere.
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

  /** "Detailed" (see `_fetchAssets`) — every asset's real file path is
   * resolved up front, since callers of this method (self-fetching
   * strategies like Big Pictures/Duplicates) read real file size or decode
   * pixels off `asset.uri`, which needs a real file, not a ph:// reference. */
  async getAllPhotos({ first = 500 }: { first?: number } = {}): Promise<Asset[]> {
    return (await this._fetchAssets('photo', first, undefined, true)).assets;
  },

  /** Photos and videos together — only categories that genuinely need
   * videos (e.g. Big Files) should use this; everything else stays on
   * getAllPhotos so existing categories are unaffected. Detailed, same as
   * getAllPhotos above. */
  async getAllMedia({ first = 500 }: { first?: number } = {}): Promise<Asset[]> {
    return (await this._fetchAssets(['photo', 'video'], first, undefined, true)).assets;
  },

  /** Paginated fetch — lets a caller load a small first page fast, then
   * fetch further pages on demand, instead of resolving hundreds of
   * assets' detail up front (see SwipeScreen, which uses this to avoid a
   * multi-second stall on large libraries). `after` accepts a cursor
   * (`endCursor` from a previous page) but SwipeScreen deliberately never
   * passes one — expo-media-library's iOS cursor resolution
   * (`fetchResult.index(of:)` against a freshly-built PHFetchResult each
   * call) isn't reliable when assets tie on the sort key, so SwipeScreen
   * instead grows `first` itself and slices off only the new tail. `after`
   * remains supported here for a caller with a real single-pass-forward
   * use case, just isn't one today. `mediaTypes` mirrors
   * CategoryStrategy.mediaTypes, so a caller can ask for exactly what the
   * active strategy needs. Not detailed (see `_fetchAssets`) — this is the
   * live-browsing path (Swipe deck, Categories previews), which only needs
   * something renderable, not a real file path. */
  async getMediaPage({
    mediaTypes,
    first,
    after,
    detailed = false,
  }: {
    mediaTypes: MediaTypeFilter[];
    first: number;
    after?: string;
    // Defaults to the fast ph:// path. SwipeScreen passes true for a
    // strategy whose needsDetailedFetch is true (Big Pictures/Big Videos —
    // see CategoryStrategy.needsDetailedFetch for why).
    detailed?: boolean;
  }): Promise<AssetPage> {
    const type = mediaTypes.length === 1 ? mediaTypes[0] : mediaTypes;
    return this._fetchAssets(type, first, after, detailed);
  },

  /** Small, targeted fetch for a single category's own preview lookup —
   * newest-first, with optional native mediaSubtypes/date-range filters so
   * a strategy can ask the OS directly for e.g. "the most recent
   * screenshot" instead of scanning a shared client-side sample for one.
   * `first` defaults to a handful (not 1) so a caller can skip past
   * already-decided (trashed/kept) assets locally without a second
   * round-trip in the common case. */
  async getPreviewCandidates({
    mediaTypes,
    mediaSubtypes,
    createdAfter,
    createdBefore,
    first = 5,
    detailed = false,
  }: {
    mediaTypes: MediaTypeFilter[];
    mediaSubtypes?: MediaLibrary.MediaSubtype[];
    createdAfter?: Date;
    createdBefore?: Date;
    first?: number;
    detailed?: boolean;
  }): Promise<Asset[]> {
    const type = mediaTypes.length === 1 ? mediaTypes[0] : mediaTypes;
    const page = await this._fetchAssets(type, first, undefined, detailed, {
      mediaSubtypes,
      createdAfter,
      createdBefore,
    });
    return page.assets;
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
    after?: string,
    detailed = true,
    filters?: AssetFilters
  ): Promise<AssetPage> {
    const key = JSON.stringify({ mediaType, first, after: after ?? null, detailed, filters: filters ?? null });
    const existing = inFlight.get(key);
    if (existing) return existing;
    // See CACHE_EVICTION_MS's comment — evictionTimer is the actual safety
    // net for a native call that never settles at all, since .finally()
    // only ever fires for a call that does. Cleared on normal settlement
    // too, so a fast, healthy fetch doesn't leave a 15s timer dangling.
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
    });

    // Enrich with full info — normalize the shape here so the rest of the
    // app never has to know about MediaLibrary's raw format. Deliberately
    // not mapping info.location (GPS coordinates) onto Asset: nothing in
    // the app reads it, and capturing sensitive location data nothing
    // uses is exactly what data-minimization rules out.
    const detailedAssets: (Asset | null)[] = await mapWithConcurrency(
      page.assets,
      async (asset): Promise<Asset | null> => {
        // Photos in the non-detailed (live-browsing) path skip
        // getAssetInfoAsync entirely and hand back the raw ph:// URI
        // as-is. Confirmed on a real device: resolving every page's
        // photos' real file paths up front was the actual cause of a
        // 7-10s wait before the first Swipe card appeared — each
        // getAssetInfoAsync call resolves synchronously on iOS's MAIN
        // THREAD when not prefetched ("Missing prefetched properties...
        // Fetching on demand on the main queue"), so 60 of them serialize
        // regardless of this file's own JS-side concurrency limit. This
        // is safe because expo-image ships a native loader specifically
        // for ph:// asset-library URIs (ios/Loaders/PhotoLibraryAssetLoader.swift,
        // auto-registered, no config needed) that resolves and decodes
        // each photo lazily, off the main thread, only for the card
        // actually being rendered — so PhotoCard must use expo-image's
        // <Image>, not React Native's, for this to render correctly.
        // Videos always resolve regardless of `detailed`: expo-video needs
        // a real playable file path, not a ph:// reference. Detailed
        // fetches (getAllPhotos/getAllMedia, used by strategies that read
        // real file size or decode pixels off asset.uri) always resolve too.
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
        // Wrapped in try/catch, not left to reject the whole page: a real
        // library (thousands of photos/videos, some possibly iCloud-only
        // or with unusual metadata) is far more likely than a small test
        // library to have at least one asset where getAssetInfoAsync
        // itself rejects, not just resolves with a missing localUri.
        // Before this, a single bad asset anywhere in a page — even just
        // one video mixed into CategoryPickerScreen's 150-item preview
        // fetch — silently broke that page's ENTIRE fetch with no visible
        // error, which meant every category's preview thumbnail (all
        // sharing that one fetch) stayed stuck on the fallback icon
        // forever. Treated exactly like an unresolvable localUri: skip
        // this one asset, keep the rest of the page.
        let info: MediaLibrary.AssetInfo;
        try {
          info = await MediaLibrary.getAssetInfoAsync(asset);
        } catch {
          return null;
        }
        // asset.uri is a ph:// reference on iOS, not directly renderable by
        // React Native's own <Image> — localUri is the actual displayable
        // file URI. If it's unavailable (e.g. an iCloud asset that failed
        // to download), skip the asset entirely rather than handing back
        // an unusable ph:// URI that would crash the image loader downstream.
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
