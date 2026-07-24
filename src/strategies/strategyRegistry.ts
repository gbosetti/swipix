import { CategoryStrategy } from './CategoryStrategy';
import { RandomPhotosStrategy } from './RandomPhotosStrategy';
import { ScreenshotStrategy } from './ScreenshotStrategy';
import { DuplicatesAndSimilarStrategy } from './DuplicatesAndSimilarStrategy';
import { AllVideosStrategy } from './AllVideosStrategy';
import { ShortVideosStrategy } from './ShortVideosStrategy';
import { BigPicturesStrategy } from './BigPicturesStrategy';
import { BigVideosStrategy } from './BigVideosStrategy';
import { BlurredImagesStrategy } from './BlurredImagesStrategy';
import { BrightnessStrategy } from './BrightnessStrategy';
import { MonthYearStrategy } from './MonthYearStrategy';
import { MonthYearVideosStrategy } from './MonthYearVideosStrategy';

/** Every strategy's stable identifier — matches that strategy's own
 * `meta.id` exactly (each strategy file is the source of truth for its
 * own literal; this type just enumerates them). This is what travels
 * through navigation params instead of a live class instance — see
 * navigation/types.ts's SwipeRouteParams and createStrategy below. */
export type StrategyId =
  | 'random'
  | 'month-year'
  | 'screenshots'
  | 'duplicates-similar'
  | 'big-pictures'
  | 'blurred-images'
  | 'dark-photos'
  | 'all-videos'
  | 'month-year-videos'
  | 'short-videos'
  | 'big-videos';

/**
 * Reconstructs a CategoryStrategy instance from a plain, serializable
 * {strategyId, params} pair. Exists because passing a live class instance
 * through React Navigation params (the previous approach) only worked by
 * accident — nothing about instances is serializable, so anything relying
 * on real navigation state (deep links, state persistence/restoration)
 * would have broken. `params` only needs the handful of primitive values
 * each strategy's constructor actually takes; strategies with no
 * constructor args ignore it entirely.
 */
export function createStrategy(strategyId: StrategyId, params: Record<string, number> = {}): CategoryStrategy {
  switch (strategyId) {
    case 'random':
      return new RandomPhotosStrategy();
    case 'month-year':
      return new MonthYearStrategy(params.year, params.month);
    case 'screenshots':
      return new ScreenshotStrategy();
    case 'duplicates-similar':
      return new DuplicatesAndSimilarStrategy();
    case 'big-pictures':
      return new BigPicturesStrategy(params.minBytes, params.maxBytes);
    case 'blurred-images':
      return new BlurredImagesStrategy();
    case 'dark-photos':
      return new BrightnessStrategy(params.minBrightness, params.maxBrightness);
    case 'all-videos':
      return new AllVideosStrategy();
    case 'month-year-videos':
      return new MonthYearVideosStrategy(params.year, params.month);
    case 'short-videos':
      return new ShortVideosStrategy(params.minSeconds, params.maxSeconds);
    case 'big-videos':
      return new BigVideosStrategy(params.minBytes, params.maxBytes);
  }
}
