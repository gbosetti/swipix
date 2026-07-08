import AsyncStorage from '@react-native-async-storage/async-storage';
import { PhotoLibraryService } from './PhotoLibraryService';
import { Asset, TrashedAsset } from '../types';

const TRASH_KEY = '@swipix/trash';
const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Deletion is NEVER instant. This is the single most important UX decision
 * in the whole app (errors must be reversible). A swipe-left
 * stages a photo here with a timestamp; only after the grace period AND
 * an explicit "empty trash" confirmation does anything become permanent.
 *
 * Keeping this logic in one service (rather than scattered through screens)
 * means the swipe UI never has to know or care about timing/persistence —
 * it just calls `moveToTrash(asset)`.
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

  /** Items whose grace period has expired and are eligible for real deletion */
  async getExpired(): Promise<TrashedAsset[]> {
    const trash = await this._load();
    const now = Date.now();
    return trash.filter((item) => now - item.trashedAt >= GRACE_PERIOD_MS);
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
