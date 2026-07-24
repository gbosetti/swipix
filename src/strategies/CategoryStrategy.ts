import { Asset, CategoryMeta, MediaTypeFilter } from '../types';
import { TrashService } from '../services/TrashService';
import { KeptService } from '../services/KeptService';

/**
 * CategoryStrategy — the contract every "category" (Dark Photos,
 * Screenshots...) must implement.
 *
 * Why an interface instead of a big switch statement?
 * Because adding a new category should NEVER require touching SwipeDeck,
 * SwipeScreen, or any other existing strategy. Open for extension,
 * closed for modification (the Open-Closed Principle).
 *
 * Each strategy is responsible for exactly two things:
 *   1. Deciding which photos belong in this category (`matchCandidates`)
 *   2. Describing itself for the UI (`meta`)
 */
export abstract class CategoryStrategy {
  /**
   * The public entry point every screen calls — not overridden by
   * subclasses. It always excludes anything already decided (trashed,
   * even mid-grace-period, or kept), so a photo you've already made a
   * call on never resurfaces as a fresh candidate. This is the one
   * place that guarantee lives, so it applies uniformly whether a
   * strategy filters the assets handed to it or sources its own
   * dataset entirely (Big Files, Short Videos, Duplicate Files, By
   * Month all self-fetch via PhotoLibraryService).
   */
  async match(assets: Asset[]): Promise<Asset[]> {
    const candidates = await this.matchCandidates(assets);
    const [trash, kept] = await Promise.all([TrashService.getTrash(), KeptService.getKept()]);
    const decided = new Set([...trash.map((a) => a.id), ...kept.map((a) => a.id)]);
    return candidates.filter((asset) => !decided.has(asset.id));
  }

  protected abstract matchCandidates(assets: Asset[]): Promise<Asset[]>;
  abstract get meta(): CategoryMeta;

  /** Which media types this strategy needs from a paginated fetch — lets
   * SwipeScreen/CategoryPickerScreen know whether to include videos.
   * Defaults to photos only; override for a video-only strategy. */
  get mediaTypes(): MediaTypeFilter[] {
    return ['photo'];
  }
}
