import AsyncStorage from '@react-native-async-storage/async-storage';
import { PhotoLibraryService } from './PhotoLibraryService';
import { Asset, TrashedAsset } from '../types';

const TRASH_KEY = '@swipix/trash';

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
    trash.push({ ...asset, trashedAt: Date.now() });
    await this._save(trash);
  },

  async restore(assetId: string): Promise<void> {
    const trash = await this._load();
    const updated = trash.filter((item) => item.id !== assetId);
    await this._save(updated);
  },

  async getTrash(): Promise<TrashedAsset[]> {
    return this._load();
  },

  async permanentlyDelete(assetIds: string[]): Promise<void> {
    await PhotoLibraryService.deleteAssets(assetIds);
    const trash = await this._load();
    const updated = trash.filter((item) => !assetIds.includes(item.id));
    await this._save(updated);
  },

  async _load(): Promise<TrashedAsset[]> {
    const raw = await AsyncStorage.getItem(TRASH_KEY);
    return raw ? JSON.parse(raw) : [];
  },

  async _save(trash: TrashedAsset[]): Promise<void> {
    await AsyncStorage.setItem(TRASH_KEY, JSON.stringify(trash));
  },
};
