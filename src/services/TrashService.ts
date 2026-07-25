import AsyncStorage from '@react-native-async-storage/async-storage';
import { PhotoLibraryService } from './PhotoLibraryService';
import { Asset, TrashedAsset } from '../types';

const TRASH_KEY = '@swipix/trash';

// A single native deleteAssetsAsync call carrying hundreds of ids risks
// the kind of hang/crash issue #11 flags: Android's Binder IPC has a
// ~1MB transaction-size ceiling that a huge id list can approach, and
// both platforms render a native confirmation UI that gets sluggish
// with very large batches. Chunking sidesteps both, and as a bonus makes
// a cancelled/failed batch only lose progress on the remainder, not the
// whole delete.
// Exported so TrashScreen can warn the user up front when a bulk delete
// will need more than one native confirmation.
export const DELETE_BATCH_SIZE = 50;

/**
 * Deletion is NEVER instant. This is the single most important UX decision
 * in the whole app (errors must be reversible). A swipe-left stages a
 * photo here; it stays until an explicit "Empty Trash Now" confirmation
 * makes it permanent — there's no automatic timer and nothing is ever
 * deleted silently in the background.
 *
 * Keeping this logic in one service (rather than scattered through screens)
 * means the swipe UI never has to know or care about persistence — it
 * just calls `moveToTrash(asset)`.
 */
export const TrashService = {
  async moveToTrash(asset: Asset): Promise<void> {
    const trash = await this._load();
    // Upsert by id, not a bare push — a storage-layer invariant (never two
    // entries for the same photo) independent of whatever called this.
    // Confirmed reachable: a self-fetching category strategy (Duplicates &
    // Similar) could hand SwipeDeck the same photo twice in one session,
    // and swiping it left both times used to create two Trash entries with
    // the same id, which broke list rendering ("two children with the same
    // key"). Re-trashing just refreshes trashedAt rather than duplicating.
    const withoutExisting = trash.filter((item) => item.id !== asset.id);
    withoutExisting.push({ ...asset, trashedAt: Date.now() });
    await this._save(withoutExisting);
  },

  async restore(assetId: string): Promise<void> {
    const trash = await this._load();
    const updated = trash.filter((item) => item.id !== assetId);
    await this._save(updated);
  },

  async getTrash(): Promise<TrashedAsset[]> {
    return this._load();
  },

  async permanentlyDelete(
    assetIds: string[],
    onProgress?: (deletedCount: number, total: number) => void
  ): Promise<void> {
    for (let start = 0; start < assetIds.length; start += DELETE_BATCH_SIZE) {
      const batch = assetIds.slice(start, start + DELETE_BATCH_SIZE);
      await PhotoLibraryService.deleteAssets(batch);
      // Persisted per batch, not just once at the end, so a batch that
      // fails partway through (native cancellation, native error) doesn't
      // strand already-deleted photos as still "pending deletion".
      const trash = await this._load();
      const updated = trash.filter((item) => !batch.includes(item.id));
      await this._save(updated);
      onProgress?.(Math.min(start + batch.length, assetIds.length), assetIds.length);
    }
  },

  async _load(): Promise<TrashedAsset[]> {
    const raw = await AsyncStorage.getItem(TRASH_KEY);
    const trash: TrashedAsset[] = raw ? JSON.parse(raw) : [];
    // Self-healing de-dupe: moveToTrash upserts by id going forward, but a
    // device that already had duplicate entries written by an older,
    // pre-upsert build of this app would otherwise keep re-triggering
    // "two children with the same key" on every Trash render forever,
    // since nothing else ever rewrites this list. Last entry wins (most
    // recently trashed), same as moveToTrash's own upsert order.
    const byId = new Map(trash.map((item) => [item.id, item]));
    return Array.from(byId.values());
  },

  async _save(trash: TrashedAsset[]): Promise<void> {
    await AsyncStorage.setItem(TRASH_KEY, JSON.stringify(trash));
  },
};
