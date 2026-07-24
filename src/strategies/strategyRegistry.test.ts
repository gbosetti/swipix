import { createStrategy } from './strategyRegistry';
import { OnThisDayStrategy } from './OnThisDayStrategy';
import { RandomPhotosStrategy } from './RandomPhotosStrategy';
import { MonthYearStrategy } from './MonthYearStrategy';
import { ScreenshotStrategy } from './ScreenshotStrategy';
import { DuplicatesAndSimilarStrategy } from './DuplicatesAndSimilarStrategy';
import { BigPicturesStrategy } from './BigPicturesStrategy';
import { BlurredImagesStrategy } from './BlurredImagesStrategy';
import { BrightnessStrategy } from './BrightnessStrategy';
import { OnThisDayVideosStrategy } from './OnThisDayVideosStrategy';
import { AllVideosStrategy } from './AllVideosStrategy';
import { MonthYearVideosStrategy } from './MonthYearVideosStrategy';
import { ShortVideosStrategy } from './ShortVideosStrategy';
import { BigVideosStrategy } from './BigVideosStrategy';

// Every strategyId must round-trip to the right class AND, for
// param-taking strategies, actually apply the params — this is what
// SwipeScreen relies on to reconstruct a real strategy from the plain
// {strategyId, params} that now travels through navigation instead of a
// live instance (see navigation/types.ts's SwipeRouteParams).
describe('createStrategy', () => {
  it('reconstructs every parameterless strategy as the right class', () => {
    expect(createStrategy('on-this-day')).toBeInstanceOf(OnThisDayStrategy);
    expect(createStrategy('random')).toBeInstanceOf(RandomPhotosStrategy);
    expect(createStrategy('screenshots')).toBeInstanceOf(ScreenshotStrategy);
    expect(createStrategy('duplicates-similar')).toBeInstanceOf(DuplicatesAndSimilarStrategy);
    expect(createStrategy('blurred-images')).toBeInstanceOf(BlurredImagesStrategy);
    expect(createStrategy('on-this-day-videos')).toBeInstanceOf(OnThisDayVideosStrategy);
    expect(createStrategy('all-videos')).toBeInstanceOf(AllVideosStrategy);
  });

  it('reconstructs date-range strategies with the given year/month', () => {
    const monthYear = createStrategy('month-year', { year: 2025, month: 3 }) as MonthYearStrategy;
    expect(monthYear).toBeInstanceOf(MonthYearStrategy);
    expect(monthYear.year).toBe(2025);
    expect(monthYear.month).toBe(3);

    const monthYearVideos = createStrategy('month-year-videos', {
      year: 2024,
      month: 11,
    }) as MonthYearVideosStrategy;
    expect(monthYearVideos).toBeInstanceOf(MonthYearVideosStrategy);
    expect(monthYearVideos.year).toBe(2024);
    expect(monthYearVideos.month).toBe(11);
  });

  it('reconstructs size-range strategies with the given byte bounds', () => {
    const bigPictures = createStrategy('big-pictures', {
      minBytes: 10,
      maxBytes: 200,
    }) as BigPicturesStrategy;
    expect(bigPictures.minBytes).toBe(10);
    expect(bigPictures.maxBytes).toBe(200);

    const bigVideos = createStrategy('big-videos', {
      minBytes: 100,
      maxBytes: Infinity,
    }) as BigVideosStrategy;
    expect(bigVideos.minBytes).toBe(100);
    expect(bigVideos.maxBytes).toBe(Infinity);
  });

  it('reconstructs brightness and duration-range strategies with their params', () => {
    const brightness = createStrategy('dark-photos', {
      minBrightness: 5,
      maxBrightness: 50,
    }) as BrightnessStrategy;
    expect(brightness.minBrightness).toBe(5);
    expect(brightness.maxBrightness).toBe(50);

    const shortVideos = createStrategy('short-videos', {
      minSeconds: 1,
      maxSeconds: 4,
    }) as ShortVideosStrategy;
    expect(shortVideos.minSeconds).toBe(1);
    expect(shortVideos.maxSeconds).toBe(4);
  });
});
