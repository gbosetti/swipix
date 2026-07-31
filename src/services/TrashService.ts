import AsyncStorage from '@react-native-async-storage/async-storage';
import { PhotoLibraryService } from './PhotoLibraryService';
import { Asset, TrashedAsset } from '../types';

const TRASH_KEY = '@swipix/trash';

/**
 * A single deleteAssetsAsync call carrying hundreds of ids risks Android's
 * ~1MB Binder IPC ceiling and a sluggish native confirmation UI (issue
 * #11). Chunking sidesteps both and limits a failed batch's blast radius.
 * Exported so TrashScreen can warn about multiple confirmations up front.
 */
export const DELETE_BATCH_SIZE = 50;

/**
 * Deletion is never instant — the single most important UX decision in
 * the app. A swipe-left stages a photo here; it stays until an explicit
 * "Empty Trash Now" confirmation makes it permanent.
 */
export const TrashService = {
  async moveToTrash(asset: Asset): Promise<void> {
    const trash = await this._load();
    // Upsert by id, not a bare push — a self-fetching strategy (Duplicates
    // & Similar) could hand the same photo twice in one session, and
    // re-trashing it should refresh trashedAt, not duplicate the entry.
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
      // Persisted per batch, not once at the end, so a failed batch
      // doesn't strand already-deleted photos as "pending deletion".
      const trash = await this._load();
      const updated = trash.filter((item) => !batch.includes(item.id));
      await this._save(updated);
      onProgress?.(Math.min(start + batch.length, assetIds.length), assetIds.length);
    }
  },

  async _load(): Promise<TrashedAsset[]> {
    const raw = await AsyncStorage.getItem(TRASH_KEY);
    const trash: TrashedAsset[] = raw ? JSON.parse(raw) : [];
    // Self-healing de-dupe for entries written by an older, pre-upsert
    // build. Last entry wins, same as moveToTrash's own upsert order.
    const byId = new Map(trash.map((item) => [item.id, item]));
    return Array.from(byId.values());
  },

  async _save(trash: TrashedAsset[]): Promise<void> {
    await AsyncStorage.setItem(TRASH_KEY, JSON.stringify(trash));
  },
};
