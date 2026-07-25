import { Asset, CategoryMeta, MediaTypeFilter } from '../types';
import { TrashService } from '../services/TrashService';
import { KeptService } from '../services/KeptService';

// Default ceiling for getPreview()'s template method — long enough for a
// real native query or a small analysis pass, short enough that a category
// stuck behind heavy processing (Duplicates & Similar) never blocks the
// user from seeing every OTHER category's preview at a normal pace.
const DEFAULT_PREVIEW_TIMEOUT_MS = 3000;

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
    return this.excludeDecided(candidates);
  }

  /** Shared by match() above and every findPreviewAsset() override — a
   * photo already trashed or kept should never resurface as a fresh
   * candidate OR as a preview thumbnail. */
  protected async excludeDecided(assets: Asset[]): Promise<Asset[]> {
    const [trash, kept] = await Promise.all([TrashService.getTrash(), KeptService.getKept()]);
    const decided = new Set([...trash.map((a) => a.id), ...kept.map((a) => a.id)]);
    return assets.filter((asset) => !decided.has(asset.id));
  }

  protected abstract matchCandidates(assets: Asset[]): Promise<Asset[]>;
  abstract get meta(): CategoryMeta;

  /** Which media types this strategy needs from a paginated fetch — lets
   * SwipeScreen/CategoryPickerScreen know whether to include videos.
   * Defaults to photos only; override for a video-only strategy. */
  get mediaTypes(): MediaTypeFilter[] {
    return ['photo'];
  }

  /** Whether this strategy needs a real, resolved file path (not a fast
   * ph:// reference) in the `assets` it's handed — true only for
   * strategies that read actual file bytes (BigPicturesStrategy,
   * BigVideosStrategy check file size off `asset.uri` directly). Confirmed
   * reachable: without this, those two silently broke on real devices once
   * SwipeScreen's default paginated fetch started handing out ph://
   * references for speed — a ph:// URI isn't a filesystem path, so
   * `new File(asset.uri).size` has nothing valid to read. Defaults to
   * false so every other strategy keeps the fast path. */
  get needsDetailedFetch(): boolean {
    return false;
  }

  /** How long getPreview() below will wait for this category's own preview
   * lookup before giving up and falling back to the plain icon. Override
   * for a strategy whose findPreviewAsset() does real per-photo analysis
   * instead of a fast, targeted native query. */
  protected previewTimeoutMs = DEFAULT_PREVIEW_TIMEOUT_MS;

  /** Template method: every category previews the same way — find one
   * representative asset, always within a bounded time, and never let one
   * category's preview block or crash any other's. Only *how* to find that
   * asset differs per category, which is the one piece findPreviewAsset
   * overrides. Never rejects: a strategy-specific error (e.g. a bad native
   * query) is treated the same as "couldn't find one in time." Not a bare
   * Promise.race — that never cancels the losing side, so a normal, fast
   * resolution would still leave the timeout's setTimeout scheduled for
   * the full previewTimeoutMs (confirmed: this leaked a live timer past
   * every successful preview, tripping Jest's "worker did not exit
   * gracefully" warning). clearTimeout below ensures only one side is
   * ever left running. */
  async getPreview(): Promise<Asset | null> {
    return new Promise((resolve) => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (__DEV__) console.warn(`getPreview timed out for ${this.meta.id} after ${this.previewTimeoutMs}ms`);
        resolve(null);
      }, this.previewTimeoutMs);

      this.findPreviewAsset()
        .catch((error) => {
          // A genuine failure here used to be silently indistinguishable
          // from "legitimately no match" — this is the only place that
          // ever finds out a strategy-specific lookup actually threw.
          if (__DEV__) console.warn(`getPreview failed for ${this.meta.id}:`, error);
          return null;
        })
        .then((asset) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          resolve(asset);
        });
    });
  }

  /** Finds one representative asset for this category's preview thumbnail
   * — a fast, targeted native lookup wherever the category has one (e.g.
   * "the most recent screenshot"), not a full matchCandidates scan over a
   * shared sample. Excludes already-decided (trashed/kept) assets, same
   * guarantee match() makes for real swiping. */
  protected abstract findPreviewAsset(): Promise<Asset | null>;
}
