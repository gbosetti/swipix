import { CategoryStrategy } from './CategoryStrategy';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta, ScanContext } from '../types';
import i18n from '../i18n';

// Big enough that a random draw usually turns up several undecided
// matches on its own, small enough to stay a cheap, light-path fetch —
// no per-item cost, so there's no pressure to keep this small the way
// detailed/pixel-analysis strategies do.
const SAMPLE_SIZE = 40;

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Genuinely scattered across the whole library, not just within whatever
 * page happens to be current — see RandomPhotosStrategy's doc comment
 * for why "All Photos" alone can't do this (SwipeScreen paginates
 * sequentially newest-first, and that strategy only shuffles within each
 * fetched page, so a long session there still reads as a coarse
 * chronological sweep). Self-fetches its own random window each call,
 * the same pattern DuplicatesAndSimilarStrategy uses.
 *
 * @remarks
 * There's no native "give me N random assets" query, and pagination is
 * cursor-based, not index-based, so there's no way to jump to an
 * arbitrary position directly either. Picking a random point within the
 * library's real date span (via getDateRange) and fetching a small
 * window there is the practical way to get a genuinely scattered sample
 * without loading the whole library up front.
 */
export class RandomShuffleStrategy extends CategoryStrategy {
  async matchCandidates(_assets: Asset[], context?: ScanContext): Promise<Asset[]> {
    const media = await this.fetchRandomWindow(SAMPLE_SIZE, context);
    return shuffle(media);
  }

  /**
   * Not cached on the instance — CategoryPickerScreen holds one
   * long-lived strategy instance for its whole preview lifetime (see
   * CategoryPickerScreen's module-level singletons), and the library
   * keeps growing, so a cached bound would silently stop covering newly
   * added photos. PhotoLibraryService's own short in-flight/eviction
   * cache already coalesces genuinely-concurrent repeats for free.
   */
  private async fetchRandomWindow(count: number, context?: ScanContext): Promise<Asset[]> {
    const dateRange = await PhotoLibraryService.getDateRange(this.mediaTypes, {
      priority: context?.priority,
      isCancelled: context?.isCancelled,
    });
    if (!dateRange) return [];
    const { oldest, newest } = dateRange;
    const randomTime = oldest.getTime() + Math.random() * (newest.getTime() - oldest.getTime());
    return PhotoLibraryService.getPreviewCandidates({
      mediaTypes: this.mediaTypes,
      createdBefore: new Date(randomTime),
      first: count,
      priority: context?.priority,
      isCancelled: context?.isCancelled,
    });
  }

  get meta(): CategoryMeta {
    return {
      id: 'random-shuffle',
      title: i18n.t('categories.random-shuffle'),
      icon: 'dice-outline',
    };
  }

  protected previewTimeoutMs = 4000;

  protected async findPreviewAsset(context?: ScanContext): Promise<Asset | null> {
    const media = await this.fetchRandomWindow(5, context);
    const undecided = await this.excludeDecided(media);
    return undecided[0] ?? null;
  }
}
