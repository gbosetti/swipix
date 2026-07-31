import { Asset, CategoryMeta, MediaTypeFilter, ScanContext } from '../types';
import { TrashService } from '../services/TrashService';
import { KeptService } from '../services/KeptService';

// Long enough for a real native query or a small analysis pass, short
// enough that a category stuck behind heavy processing (Duplicates &
// Similar) never blocks every other category's preview.
const DEFAULT_PREVIEW_TIMEOUT_MS = 3000;

/**
 * The contract every category (Dark Photos, Screenshots, ...) implements.
 *
 * @remarks
 * An interface rather than a switch statement — adding a category should
 * never require touching SwipeDeck, SwipeScreen, or any other strategy
 * (open for extension, closed for modification). Each strategy is
 * responsible for exactly two things: which photos belong
 * ({@link matchCandidates}) and how to describe itself ({@link meta}).
 */
export abstract class CategoryStrategy {
  /**
   * Public entry point every screen calls, not overridden by subclasses.
   * Always excludes anything already decided (trashed or kept) — the one
   * place that guarantee lives, whether a strategy filters the assets
   * it's handed or self-fetches its own dataset.
   *
   * @param context Optional progress/priority/cancellation for a strategy
   * whose matching does real scanning (self-fetch, pixel analysis) —
   * ignored by strategies that don't.
   */
  async match(assets: Asset[], context?: ScanContext): Promise<Asset[]> {
    const candidates = await this.matchCandidates(assets, context);
    return this.excludeDecided(candidates);
  }

  /**
   * Shared by {@link match} and every `findPreviewAsset` override — a
   * decided photo should never resurface as a candidate or a preview.
   */
  protected async excludeDecided(assets: Asset[]): Promise<Asset[]> {
    const [trash, kept] = await Promise.all([TrashService.getTrash(), KeptService.getKept()]);
    const decided = new Set([...trash.map((a) => a.id), ...kept.map((a) => a.id)]);
    return assets.filter((asset) => !decided.has(asset.id));
  }

  protected abstract matchCandidates(assets: Asset[], context?: ScanContext): Promise<Asset[]>;
  abstract get meta(): CategoryMeta;

  /**
   * Media types this strategy needs from a paginated fetch. Defaults to
   * photos only; override for a video-only strategy.
   */
  get mediaTypes(): MediaTypeFilter[] {
    return ['photo'];
  }

  /**
   * Whether this strategy needs a real resolved file path rather than a
   * fast `ph://` reference — true only for strategies that read actual
   * file bytes (e.g. size). Defaults to false.
   */
  get needsDetailedFetch(): boolean {
    return false;
  }

  /**
   * Scopes the paginated fetch to one native album. Only AlbumStrategy
   * sets this; every other strategy searches the whole library.
   */
  get albumId(): string | undefined {
    return undefined;
  }

  /**
   * How long {@link getPreview} waits before giving up and falling back
   * to the plain icon. Override for a strategy whose `findPreviewAsset`
   * does real per-photo analysis instead of a fast native query.
   */
  protected previewTimeoutMs = DEFAULT_PREVIEW_TIMEOUT_MS;

  /**
   * Template method: find one representative asset within a bounded
   * time, never letting one category's preview block or crash another's.
   * Only *how* to find it differs per category — see {@link findPreviewAsset}.
   *
   * @remarks
   * Not a bare `Promise.race` — that never cancels the losing side, so a
   * normal fast resolution would still leave the timeout scheduled for
   * the full duration.
   */
  async getPreview(context?: ScanContext): Promise<Asset | null> {
    return new Promise((resolve) => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (__DEV__) console.warn(`getPreview timed out for ${this.meta.id} after ${this.previewTimeoutMs}ms`);
        resolve(null);
      }, this.previewTimeoutMs);

      this.findPreviewAsset(context)
        .catch((error) => {
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

  /**
   * Finds one representative asset for the preview thumbnail — a fast,
   * targeted lookup, not a full {@link matchCandidates} scan. Excludes
   * already-decided assets, same as {@link match}. `context` only matters
   * to a strategy whose preview lookup does real native/detailed work
   * (Big Pictures/Videos, Duplicates & Similar) — every other strategy's
   * preview is a single fast query and can ignore it.
   */
  protected abstract findPreviewAsset(context?: ScanContext): Promise<Asset | null>;
}
