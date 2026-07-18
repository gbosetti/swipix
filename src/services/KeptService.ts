import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from '../types';

const KEPT_KEY = '@swipix/kept';

/**
 * Every photo you've swiped right on, across every category — lets you
 * browse back through past "keep" decisions and reconsider some,
 * without needing to remember which category each one came from.
 *
 * Mirrors TrashService's storage pattern, but there's no permanent
 * deletion here: keeping a photo isn't a destructive action, so nothing
 * needs an explicit "empty" step.
 */
export const KeptService = {
  async addKept(asset: Asset): Promise<void> {
    const kept = await this._load();
    // Reconsidering an already-kept photo (swiping right on it again in
    // the Kept tab) shouldn't duplicate the entry.
    if (kept.some((item) => item.id === asset.id)) return;
    kept.push(asset);
    await this._save(kept);
  },

  async removeKept(assetId: string): Promise<void> {
    const kept = await this._load();
    const updated = kept.filter((item) => item.id !== assetId);
    await this._save(updated);
  },

  /** Un-marks every kept photo at once — same effect as tapping "Swipe
   * Again" on each one individually, just without doing it one by one.
   * Still not destructive: every photo just goes back into the normal,
   * undecided pool to be swiped on again later. */
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
    return raw ? JSON.parse(raw) : [];
  },

  async _save(kept: Asset[]): Promise<void> {
    await AsyncStorage.setItem(KEPT_KEY, JSON.stringify(kept));
  },
};
