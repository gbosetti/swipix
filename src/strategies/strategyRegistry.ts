import { CategoryStrategy } from './CategoryStrategy';
import { RandomPhotosStrategy } from './RandomPhotosStrategy';
import { RandomShuffleStrategy } from './RandomShuffleStrategy';
import { ScreenshotStrategy } from './ScreenshotStrategy';
import { AlbumStrategy } from './AlbumStrategy';
import { AlbumVideosStrategy } from './AlbumVideosStrategy';
import { DuplicatesAndSimilarStrategy } from './DuplicatesAndSimilarStrategy';
import { AllVideosStrategy } from './AllVideosStrategy';
import { ShortVideosStrategy } from './ShortVideosStrategy';
import { BigPicturesStrategy } from './BigPicturesStrategy';
import { BigVideosStrategy } from './BigVideosStrategy';
import { BlurredImagesStrategy } from './BlurredImagesStrategy';
import { BrightnessStrategy } from './BrightnessStrategy';
import { MonthYearStrategy } from './MonthYearStrategy';
import { MonthYearVideosStrategy } from './MonthYearVideosStrategy';

/**
 * Every strategy's stable identifier, matching its own `meta.id`. Travels
 * through navigation params instead of a live class instance — see
 * navigation/types.ts's SwipeRouteParams.
 */
export type StrategyId =
  | 'random'
  | 'random-shuffle'
  | 'month-year'
  | 'screenshots'
  | 'album'
  | 'album-videos'
  | 'duplicates-similar'
  | 'big-pictures'
  | 'blurred-images'
  | 'dark-photos'
  | 'all-videos'
  | 'month-year-videos'
  | 'short-videos'
  | 'big-videos';

/**
 * Reconstructs a CategoryStrategy from a plain, serializable
 * `{strategyId, params}` pair — a live class instance isn't serializable,
 * so it can't travel through React Navigation params directly.
 */
export function createStrategy(
  strategyId: StrategyId,
  params: Record<string, number | string> = {}
): CategoryStrategy {
  switch (strategyId) {
    case 'random':
      return new RandomPhotosStrategy();
    case 'random-shuffle':
      return new RandomShuffleStrategy();
    case 'month-year':
      return new MonthYearStrategy(params.year as number, params.month as number);
    case 'screenshots':
      return new ScreenshotStrategy();
    case 'album':
      return new AlbumStrategy((params.albumId as string) ?? '');
    case 'album-videos':
      return new AlbumVideosStrategy((params.albumId as string) ?? '');
    case 'duplicates-similar':
      return new DuplicatesAndSimilarStrategy();
    case 'big-pictures':
      return new BigPicturesStrategy(params.minBytes as number, params.maxBytes as number);
    case 'blurred-images':
      return new BlurredImagesStrategy();
    case 'dark-photos':
      return new BrightnessStrategy(params.minBrightness as number, params.maxBrightness as number);
    case 'all-videos':
      return new AllVideosStrategy();
    case 'month-year-videos':
      return new MonthYearVideosStrategy(params.year as number, params.month as number);
    case 'short-videos':
      return new ShortVideosStrategy(params.minSeconds as number, params.maxSeconds as number);
    case 'big-videos':
      return new BigVideosStrategy(params.minBytes as number, params.maxBytes as number);
  }
}
