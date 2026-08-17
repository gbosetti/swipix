import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from '../types';

const KEPT_KEY = '@swipix/kept';

/**
 * Every photo swiped right on, across every category. Mirrors
 * TrashService's storage pattern, but nothing here is destructive, so
 * there's no explicit "empty" step.
 */
export const KeptService = {
  async addKept(asset: Asset): Promise<void> {
    const kept = await this._load();
    // Reconsidering an already-kept photo (swiping right on it again in
    // the Kept tab) shouldn't duplicate the entry.
    if (kept.some((item) => item.id === asset.id)) {
      return;
    }
    kept.push(asset);
    await this._save(kept);
  },

  async removeKept(assetId: string): Promise<void> {
    const kept = await this._load();
    const updated = kept.filter((item) => item.id !== assetId);
    await this._save(updated);
  },

  /**
   * Un-marks every kept photo at once, same as "Swipe Again" on each
   * individually — every photo just returns to the undecided pool.
   */
  async clearAll(): Promise<void> {
    await this._save([]);
  },

  async isKept(assetId: string): Promise<boolean> {
    const kept = await this._load();
    return kept.some((item) => item.id === assetId);
  },

  async getKept(): Promise<Asset[]> {
    return this._load();
  },

  async _load(): Promise<Asset[]> {
    const raw = await AsyncStorage.getItem(KEPT_KEY);
    const kept: Asset[] = raw ? JSON.parse(raw) : [];
    // Self-healing de-dupe — see TrashService._load().
    const byId = new Map(kept.map((item) => [item.id, item]));
    return Array.from(byId.values());
  },

  async _save(kept: Asset[]): Promise<void> {
    await AsyncStorage.setItem(KEPT_KEY, JSON.stringify(kept));
  },
};
