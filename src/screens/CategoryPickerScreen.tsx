import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, Pressable, StyleSheet, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import type { VideoThumbnail } from 'expo-video';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import RangeSlider from '../components/RangeSlider';
import MonthYearPicker from '../components/MonthYearPicker';
import AlbumPicker from '../components/AlbumPicker';
import { RandomPhotosStrategy } from '../strategies/RandomPhotosStrategy';
import { ScreenshotStrategy } from '../strategies/ScreenshotStrategy';
import { AlbumStrategy } from '../strategies/AlbumStrategy';
import { AlbumVideosStrategy } from '../strategies/AlbumVideosStrategy';
import { DuplicatesAndSimilarStrategy } from '../strategies/DuplicatesAndSimilarStrategy';
import { AllVideosStrategy } from '../strategies/AllVideosStrategy';
import { ShortVideosStrategy } from '../strategies/ShortVideosStrategy';
import { BigPicturesStrategy } from '../strategies/BigPicturesStrategy';
import { BigVideosStrategy } from '../strategies/BigVideosStrategy';
import { BlurredImagesStrategy } from '../strategies/BlurredImagesStrategy';
import { BrightnessStrategy } from '../strategies/BrightnessStrategy';
import { MonthYearStrategy } from '../strategies/MonthYearStrategy';
import { MonthYearVideosStrategy } from '../strategies/MonthYearVideosStrategy';
import { CategoryStrategy } from '../strategies/CategoryStrategy';
import { TrashService } from '../services/TrashService';
import { PhotoLibraryService, Album } from '../services/PhotoLibraryService';
import { beginForegroundSession, ForegroundSession } from '../services/ForegroundSession';
import { getVideoThumbnail } from '../services/VideoThumbnailService';
import StorageMeter from '../components/StorageMeter';
import { CategoriesStackParamList, RootTabParamList } from '../navigation/types';
import { CategoryMeta, ScanContext } from '../types';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';

/**
 * Resolves a category card's preview to whatever `<Image>` needs — a
 * plain URI, or an extracted frame for a video. `getPreview()` never
 * rejects and is already timeout-bounded, so nothing to catch here.
 */
async function resolvePreviewDisplay(
  strategy: CategoryStrategy,
  context: ScanContext
): Promise<string | VideoThumbnail | null> {
  const asset = await strategy.getPreview(context);
  if (!asset) {
    return null;
  }
  if (asset.mediaType === 'video') {
    return getVideoThumbnail(asset.uri);
  }
  return asset.uri;
}

const DEFAULT_SHORT_VIDEO_RANGE: [number, number] = [0, 3];
const SHORT_VIDEO_RANGE_KEY = '@swipix/shortVideoRange';
const DEFAULT_BIG_PICTURE_RANGE_MB: [number, number] = [20, 200];
const BIG_PICTURE_RANGE_KEY = '@swipix/bigPictureRangeMB';
const BIG_PICTURE_SLIDER_MAX_MB = 200;
function toBigPictureMaxBytes(highMB: number): number {
  return highMB >= BIG_PICTURE_SLIDER_MAX_MB ? Infinity : highMB * 1024 * 1024;
}
const DEFAULT_BIG_VIDEO_RANGE_MB: [number, number] = [100, 2000];
const BIG_VIDEO_RANGE_KEY = '@swipix/bigVideoRangeMB';
/**
 * The slider's ceiling means "and above," not a hard cap — a hard cap
 * would silently exclude the very files a "big videos" filter exists for.
 */
const BIG_VIDEO_SLIDER_MAX_MB = 5000;
function toBigVideoMaxBytes(highMB: number): number {
  return highMB >= BIG_VIDEO_SLIDER_MAX_MB ? Infinity : highMB * 1024 * 1024;
}
const DEFAULT_BRIGHTNESS_RANGE: [number, number] = [0, 70];
const BRIGHTNESS_RANGE_KEY = '@swipix/brightnessRange';
const MONTH_YEAR_KEY = '@swipix/monthYear';
const MONTH_YEAR_VIDEO_KEY = '@swipix/monthYearVideo';
const ALBUM_ID_KEY = '@swipix/albumId';
const ALBUM_VIDEO_ID_KEY = '@swipix/albumVideoId';

/**
 * Duplicates & Similar, Big Pictures, and Big Videos all resolve their
 * preview via a real per-item native scan (not a plain filtered query),
 * which only stays cheap on a library this size or smaller — above it,
 * their cards just keep the fallback icon rather than attempt one.
 */
const EXPENSIVE_PREVIEW_ASSET_THRESHOLD = 1000;

/**
 * Caps how many preview thumbnails decode at once — confirmed as a real
 * OOM crash on a low-end/32-bit device when all ~12 fired simultaneously
 * right after permission grant.
 */
const PREVIEW_CONCURRENCY = 3;

const randomPhotosStrategy = new RandomPhotosStrategy();
const screenshotStrategy = new ScreenshotStrategy();
const duplicatesAndSimilarStrategy = new DuplicatesAndSimilarStrategy();
/**
 * Held as instances, not pre-read `.meta`, so `.meta.title`'s translation
 * lookup re-evaluates fresh on every render instead of freezing at import.
 */
const allVideosStrategy = new AllVideosStrategy();
const shortVideosDefaults = new ShortVideosStrategy();
const bigPicturesDefaults = new BigPicturesStrategy();
const bigVideosDefaults = new BigVideosStrategy();
const blurredImagesStrategy = new BlurredImagesStrategy();
const brightnessDefaults = new BrightnessStrategy();
const monthYearDefaults = new MonthYearStrategy(0, 0);
const monthYearVideosDefaults = new MonthYearVideosStrategy(0, 0);
/**
 * meta.title/icon are constant regardless of which album is selected —
 * used only for the card header.
 */
const albumDefaults = new AlbumStrategy('');
const albumVideosDefaults = new AlbumVideosStrategy('');

/**
 * Composite: navigates within its own stack (to Swipe) and to a sibling
 * tab (Trash) from the trash banner.
 */
type Props = CompositeScreenProps<
  NativeStackScreenProps<CategoriesStackParamList, 'CategoryPicker'>,
  BottomTabScreenProps<RootTabParamList>
>;

const titleRowStyles = StyleSheet.create({
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  thumbnail: { width: 44, height: 44, borderRadius: 10 },
  thumbnailPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '600', flexShrink: 1 },
  chevron: { fontSize: 22, fontWeight: '400' },
});

/**
 * Title + chevron affordance shared by every card. `previewUri` falls
 * back to the category's `meta.icon` when there's no match yet. Uses
 * expo-image's `<Image>` since it can render both a plain URI and an
 * extracted video-frame reference through the same `source` prop.
 */
function TitleRow({
  title,
  icon,
  previewUri,
}: {
  title: string;
  icon: CategoryMeta['icon'];
  previewUri?: string | VideoThumbnail | null;
}) {
  const colors = useColors();
  return (
    <View style={titleRowStyles.titleRow}>
      <View style={titleRowStyles.left}>
        {previewUri ? (
          <Image source={previewUri} style={titleRowStyles.thumbnail} contentFit="cover" />
        ) : (
          <View
            style={[
              titleRowStyles.thumbnail,
              titleRowStyles.thumbnailPlaceholder,
              { backgroundColor: colors.cardDark },
            ]}
          >
            <Ionicons name={icon} size={22} color={colors.textSecondary} />
          </View>
        )}
        <Text style={[titleRowStyles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <Text style={[titleRowStyles.chevron, { color: colors.textSecondary }]}>›</Text>
    </View>
  );
}

export default function CategoryPickerScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [shortVideoRange, setShortVideoRange] = useState(DEFAULT_SHORT_VIDEO_RANGE);
  const [bigPictureRangeMB, setBigPictureRangeMB] = useState(DEFAULT_BIG_PICTURE_RANGE_MB);
  const [bigVideoRangeMB, setBigVideoRangeMB] = useState(DEFAULT_BIG_VIDEO_RANGE_MB);
  const [brightnessRange, setBrightnessRange] = useState(DEFAULT_BRIGHTNESS_RANGE);
  const now = new Date();
  const [monthYear, setMonthYear] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [monthYearVideo, setMonthYearVideo] = useState({
    year: now.getFullYear(),
    month: now.getMonth(),
  });
  const [trashCount, setTrashCount] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  /**
   * Gates whether the expensive preview strategies (Duplicates & Similar,
   * Big Pictures, Big Videos) are even attempted — see the threshold
   * check in refreshAllPreviews. null until resolved.
   */
  const [librarySize, setLibrarySize] = useState<number | null>(null);
  const [previews, setPreviews] = useState<Record<string, string | VideoThumbnail | null>>({});
  const [photoAlbums, setPhotoAlbums] = useState<Album[] | null>(null);
  const [videoAlbums, setVideoAlbums] = useState<Album[] | null>(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedVideoAlbumId, setSelectedVideoAlbumId] = useState<string | null>(null);

  useEffect(() => {
    const loadRange = (key: string, setter: (range: [number, number]) => void) => {
      AsyncStorage.getItem(key).then((stored) => {
        if (stored != null) {
          const [low, high] = stored.split(',').map(Number);
          setter([low, high]);
        }
      });
    };
    loadRange(SHORT_VIDEO_RANGE_KEY, setShortVideoRange);
    loadRange(BIG_PICTURE_RANGE_KEY, setBigPictureRangeMB);
    loadRange(BIG_VIDEO_RANGE_KEY, setBigVideoRangeMB);
    loadRange(BRIGHTNESS_RANGE_KEY, setBrightnessRange);
    AsyncStorage.getItem(MONTH_YEAR_KEY).then((stored) => {
      if (stored != null) {
        const [year, month] = stored.split(',').map(Number);
        setMonthYear({ year, month });
      }
    });
    AsyncStorage.getItem(MONTH_YEAR_VIDEO_KEY).then((stored) => {
      if (stored != null) {
        const [year, month] = stored.split(',').map(Number);
        setMonthYearVideo({ year, month });
      }
    });
    AsyncStorage.getItem(ALBUM_ID_KEY).then((stored) => {
      if (stored != null) {
        setSelectedAlbumId(stored);
      }
    });
    AsyncStorage.getItem(ALBUM_VIDEO_ID_KEY).then((stored) => {
      if (stored != null) {
        setSelectedVideoAlbumId(stored);
      }
    });
  }, []);

  useEffect(() => {
    PhotoLibraryService.requestPermission().then((granted) => {
      if (__DEV__ && !granted) {
        console.warn('CategoryPickerScreen: photo permission not granted, previews will never load');
      }
      setPermissionGranted(granted);
    });
  }, []);

  /**
   * One cheap count query, resolved once per mount — refreshAllPreviews
   * waits for this before firing so the expensive-strategy gate below is
   * never a guess. A failed count is treated as "large" (skip the
   * expensive previews) — safer than assuming small and risking the
   * exact contention this exists to avoid.
   */
  useEffect(() => {
    if (!permissionGranted) {
      return;
    }
    PhotoLibraryService.getLibrarySize()
      .then(setLibrarySize)
      .catch(() => setLibrarySize(Infinity));
  }, [permissionGranted]);

  /**
   * Two independent lists, not one shared one: an all-video album (e.g. a
   * GoPro import) would otherwise show in the photo picker with nothing
   * for AlbumStrategy to find — each list is scoped to its media type.
   */
  useEffect(() => {
    if (!permissionGranted) {
      return;
    }
    PhotoLibraryService.getAlbums('photo').then((fetched) => {
      setPhotoAlbums(fetched);
      setSelectedAlbumId((current) => current ?? fetched[0]?.id ?? null);
    });
    PhotoLibraryService.getAlbums('video').then((fetched) => {
      setVideoAlbums(fetched);
      setSelectedVideoAlbumId((current) => current ?? fetched[0]?.id ?? null);
    });
  }, [permissionGranted]);

  /**
   * Shared with SwipeScreen via ForegroundSession — begun on focus below,
   * so opening a category to swipe correctly supersedes this screen's own
   * preview work: a result that resolves after that happens gets dropped
   * instead of applying (native work already in flight still finishes and
   * updates PhotoLibraryService's own cache, it just no longer bothers
   * updating this screen's state — the very next focus re-requests it
   * anyway, and reuses that in-flight fetch if it's still running).
   */
  const sessionRef = useRef<ForegroundSession | null>(null);

  /**
   * null while the count is still resolving — treated as "not yet," same
   * as a library that's too big, so nothing fires prematurely.
   */
  const canAttemptExpensivePreview =
    librarySize !== null && librarySize < EXPENSIVE_PREVIEW_ASSET_THRESHOLD;

  /**
   * Each category resolves its own preview independently, via its own
   * CategoryStrategy.getPreview — one slow/failed lookup can't block or
   * break another's.
   */
  const refreshPreview = useCallback((strategy: CategoryStrategy) => {
    const session = sessionRef.current;
    /**
     * Background preview work, not an active swipe session — 'low'
     * priority, and stoppable the instant this screen loses focus rather
     * than grinding through a whole strategy's fetch unattended.
     */
    const context: ScanContext = { priority: 'low', isCancelled: () => !!session && !session.isCurrent() };
    return resolvePreviewDisplay(strategy, context).then((display) => {
      if (session && !session.isCurrent()) {
        return;
      }
      setPreviews((current) => ({ ...current, [strategy.meta.id]: display }));
    });
  }, []);

  /**
   * Every category's preview, resolved independently — but batched
   * PREVIEW_CONCURRENCY at a time rather than all fired together, so
   * decoding one doesn't compound the others' peak memory use.
   * Re-invoked on first load and on every later focus (below), so a
   * preview that failed once gets another chance.
   */
  const refreshAllPreviews = useCallback(async () => {
    const strategies: CategoryStrategy[] = [
      randomPhotosStrategy,
      screenshotStrategy,
      ...(canAttemptExpensivePreview ? [duplicatesAndSimilarStrategy] : []),
      blurredImagesStrategy,
      allVideosStrategy,
      new ShortVideosStrategy(shortVideoRange[0], shortVideoRange[1]),
      ...(canAttemptExpensivePreview
        ? [
            new BigPicturesStrategy(
              bigPictureRangeMB[0] * 1024 * 1024,
              toBigPictureMaxBytes(bigPictureRangeMB[1])
            ),
            new BigVideosStrategy(
              bigVideoRangeMB[0] * 1024 * 1024,
              toBigVideoMaxBytes(bigVideoRangeMB[1])
            ),
          ]
        : []),
      new BrightnessStrategy(brightnessRange[0], brightnessRange[1]),
      new MonthYearStrategy(monthYear.year, monthYear.month),
      new MonthYearVideosStrategy(monthYearVideo.year, monthYearVideo.month),
      ...(selectedAlbumId ? [new AlbumStrategy(selectedAlbumId)] : []),
      ...(selectedVideoAlbumId ? [new AlbumVideosStrategy(selectedVideoAlbumId)] : []),
    ];
    for (let i = 0; i < strategies.length; i += PREVIEW_CONCURRENCY) {
      const batch = strategies.slice(i, i + PREVIEW_CONCURRENCY);
      await Promise.all(batch.map((strategy) => refreshPreview(strategy)));
    }
  }, [
    refreshPreview,
    canAttemptExpensivePreview,
    shortVideoRange,
    bigPictureRangeMB,
    bigVideoRangeMB,
    brightnessRange,
    monthYear,
    monthYearVideo,
    selectedAlbumId,
    selectedVideoAlbumId,
  ]);

  /**
   * Read by useFocusEffect below instead of closing over refreshAllPreviews
   * directly. refreshAllPreviews's identity changes whenever any filter it
   * reads does (range sliders, month/album selection, canAttemptExpensivePreview
   * once librarySize resolves) — useFocusEffect depending on that identity
   * would re-subscribe (cleanup + re-fire, not just on a real focus change)
   * every time any of those settles, superseding the in-progress session and
   * restarting from zero. Confirmed on a real device: right after a fresh
   * permission grant, this could repeat badly enough that previews flashed
   * in and were immediately superseded before finishing, while a later
   * visit (nothing left mid-flight to interrupt) looked fine. A ref sidesteps
   * this entirely — useFocusEffect only cares about real focus/permission
   * changes, never about what refreshAllPreviews happens to close over.
   */
  const refreshAllPreviewsRef = useRef(refreshAllPreviews);
  refreshAllPreviewsRef.current = refreshAllPreviews;

  /**
   * Waits for both permission and the library-size check — otherwise this
   * would fire while `canAttemptExpensivePreview` is still guessing "no"
   * (librarySize null), skipping the expensive previews on every first
   * load even for a small library. Later refreshes (range/month changes,
   * regaining focus) are handled by their own triggers below.
   */
  useEffect(() => {
    if (permissionGranted && librarySize !== null) {
      refreshAllPreviews();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionGranted, librarySize]);

  /**
   * The album list resolves later than permissionGranted, so the first
   * refreshAllPreviews() run above usually skips both album previews —
   * this covers them once a selection exists.
   */
  useEffect(() => {
    if (!selectedAlbumId) {
      return;
    }
    refreshPreview(new AlbumStrategy(selectedAlbumId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAlbumId]);

  useEffect(() => {
    if (!selectedVideoAlbumId) {
      return;
    }
    refreshPreview(new AlbumVideosStrategy(selectedVideoAlbumId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVideoAlbumId]);

  const refreshTrashCount = useCallback(() => {
    TrashService.getTrash().then((trash) => setTrashCount(trash.length));
  }, []);

  /**
   * Refresh on every focus (e.g. back from Trash or a swipe session), not
   * just on mount — the first focus fires before permission resolves, so
   * permissionGranted is checked rather than assumed. Also where this
   * screen claims the shared ForegroundSession as the current foreground
   * activity — see refreshPreview's use of it above.
   */
  useFocusEffect(
    useCallback(() => {
      sessionRef.current = beginForegroundSession();
      refreshTrashCount();
      if (permissionGranted) {
        refreshAllPreviewsRef.current();
      }
      return () => sessionRef.current?.end();
    }, [refreshTrashCount, permissionGranted])
  );

  const persistShortVideoRange = (low: number, high: number) => {
    AsyncStorage.setItem(SHORT_VIDEO_RANGE_KEY, `${low},${high}`);
    refreshPreview(new ShortVideosStrategy(low, high));
  };

  const persistBigPictureRange = (low: number, high: number) => {
    AsyncStorage.setItem(BIG_PICTURE_RANGE_KEY, `${low},${high}`);
    if (canAttemptExpensivePreview) {
      refreshPreview(new BigPicturesStrategy(low * 1024 * 1024, toBigPictureMaxBytes(high)));
    }
  };

  const persistBigVideoRange = (low: number, high: number) => {
    AsyncStorage.setItem(BIG_VIDEO_RANGE_KEY, `${low},${high}`);
    if (canAttemptExpensivePreview) {
      refreshPreview(new BigVideosStrategy(low * 1024 * 1024, toBigVideoMaxBytes(high)));
    }
  };

  const persistBrightnessRange = (low: number, high: number) => {
    AsyncStorage.setItem(BRIGHTNESS_RANGE_KEY, `${low},${high}`);
    refreshPreview(new BrightnessStrategy(low, high));
  };

  const handleMonthYearChange = (year: number, month: number) => {
    setMonthYear({ year, month });
    AsyncStorage.setItem(MONTH_YEAR_KEY, `${year},${month}`);
    refreshPreview(new MonthYearStrategy(year, month));
  };

  const handleMonthYearVideoChange = (year: number, month: number) => {
    setMonthYearVideo({ year, month });
    AsyncStorage.setItem(MONTH_YEAR_VIDEO_KEY, `${year},${month}`);
    refreshPreview(new MonthYearVideosStrategy(year, month));
  };

  const handleAlbumChange = (albumId: string) => {
    setSelectedAlbumId(albumId);
    AsyncStorage.setItem(ALBUM_ID_KEY, albumId);
    refreshPreview(new AlbumStrategy(albumId));
  };

  const handleVideoAlbumChange = (albumId: string) => {
    setSelectedVideoAlbumId(albumId);
    AsyncStorage.setItem(ALBUM_VIDEO_ID_KEY, albumId);
    refreshPreview(new AlbumVideosStrategy(albumId));
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <StorageMeter />

      {trashCount > 0 && (
        <View style={styles.trashBanner}>
          <Text style={styles.trashBannerText}>
            🗑 {t('categoryPicker.trashBanner', { count: trashCount })}
          </Text>
          <Pressable onPress={() => navigation.navigate('TrashTab')} style={styles.trashButton}>
            <Text style={styles.trashButtonText}>{t('categoryPicker.review')}</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.sectionHeader}>{t('categoryPicker.picturesSectionHeader')}</Text>

      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('Swipe', { strategyId: 'random' })}
      >
        <TitleRow
          title={randomPhotosStrategy.meta.title}
          icon={randomPhotosStrategy.meta.icon}
          previewUri={previews[randomPhotosStrategy.meta.id]}
        />
      </Pressable>

      <View style={styles.card}>
        <Pressable
          onPress={() =>
            navigation.navigate('Swipe', {
              strategyId: 'month-year',
              params: { year: monthYear.year, month: monthYear.month },
            })
          }
        >
          <TitleRow
            title={monthYearDefaults.meta.title}
            icon={monthYearDefaults.meta.icon}
            previewUri={previews[monthYearDefaults.meta.id]}
          />
        </Pressable>
        <MonthYearPicker
          year={monthYear.year}
          month={monthYear.month}
          onChange={handleMonthYearChange}
        />
      </View>

      <View style={styles.card}>
        <Pressable
          onPress={() =>
            selectedAlbumId &&
            navigation.navigate('Swipe', { strategyId: 'album', params: { albumId: selectedAlbumId } })
          }
        >
          <TitleRow
            title={albumDefaults.meta.title}
            icon={albumDefaults.meta.icon}
            previewUri={selectedAlbumId ? previews[`album-${selectedAlbumId}`] : null}
          />
        </Pressable>
        <AlbumPicker albums={photoAlbums} selectedAlbumId={selectedAlbumId} onChange={handleAlbumChange} />
      </View>

      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('Swipe', { strategyId: 'screenshots' })}
      >
        <TitleRow
          title={screenshotStrategy.meta.title}
          icon={screenshotStrategy.meta.icon}
          previewUri={previews[screenshotStrategy.meta.id]}
        />
      </Pressable>

      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('Swipe', { strategyId: 'duplicates-similar' })}
      >
        <TitleRow
          title={duplicatesAndSimilarStrategy.meta.title}
          icon={duplicatesAndSimilarStrategy.meta.icon}
          previewUri={previews[duplicatesAndSimilarStrategy.meta.id]}
        />
      </Pressable>

      <View style={styles.card}>
        <Pressable
          onPress={() =>
            navigation.navigate('Swipe', {
              strategyId: 'big-pictures',
              params: {
                minBytes: bigPictureRangeMB[0] * 1024 * 1024,
                maxBytes: toBigPictureMaxBytes(bigPictureRangeMB[1]),
              },
            })
          }
        >
          <TitleRow
            title={bigPicturesDefaults.meta.title}
            icon={bigPicturesDefaults.meta.icon}
            previewUri={previews[bigPicturesDefaults.meta.id]}
          />
        </Pressable>
        <Text style={styles.sliderLabel}>
          {bigPictureRangeMB[1] >= BIG_PICTURE_SLIDER_MAX_MB
            ? t('categoryPicker.bigPicturesLabelUnbounded', { min: bigPictureRangeMB[0] })
            : t('categoryPicker.bigPicturesLabel', {
                min: bigPictureRangeMB[0],
                max: bigPictureRangeMB[1],
              })}
        </Text>
        <RangeSlider
          minimumValue={5}
          maximumValue={BIG_PICTURE_SLIDER_MAX_MB}
          step={5}
          lowValue={bigPictureRangeMB[0]}
          highValue={bigPictureRangeMB[1]}
          onValuesChange={(low, high) => setBigPictureRangeMB([low, high])}
          onSlidingComplete={persistBigPictureRange}
        />
      </View>

      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('Swipe', { strategyId: 'blurred-images' })}
      >
        <TitleRow
          title={blurredImagesStrategy.meta.title}
          icon={blurredImagesStrategy.meta.icon}
          previewUri={previews[blurredImagesStrategy.meta.id]}
        />
      </Pressable>

      <View style={styles.card}>
        <Pressable
          onPress={() =>
            navigation.navigate('Swipe', {
              strategyId: 'dark-photos',
              params: { minBrightness: brightnessRange[0], maxBrightness: brightnessRange[1] },
            })
          }
        >
          <TitleRow
            title={brightnessDefaults.meta.title}
            icon={brightnessDefaults.meta.icon}
            previewUri={previews[brightnessDefaults.meta.id]}
          />
        </Pressable>
        <Text style={styles.sliderLabel}>
          {t('categoryPicker.brightnessLabel', { min: brightnessRange[0], max: brightnessRange[1] })}
        </Text>
        <RangeSlider
          minimumValue={0}
          maximumValue={255}
          step={5}
          lowValue={brightnessRange[0]}
          highValue={brightnessRange[1]}
          onValuesChange={(low, high) => setBrightnessRange([low, high])}
          onSlidingComplete={persistBrightnessRange}
        />
      </View>

      <Text style={styles.sectionHeader}>{t('categoryPicker.videosSectionHeader')}</Text>

      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('Swipe', { strategyId: 'all-videos' })}
      >
        <TitleRow
          title={allVideosStrategy.meta.title}
          icon={allVideosStrategy.meta.icon}
          previewUri={previews[allVideosStrategy.meta.id]}
        />
      </Pressable>

      <View style={styles.card}>
        <Pressable
          onPress={() =>
            navigation.navigate('Swipe', {
              strategyId: 'month-year-videos',
              params: { year: monthYearVideo.year, month: monthYearVideo.month },
            })
          }
        >
          <TitleRow
            title={monthYearVideosDefaults.meta.title}
            icon={monthYearVideosDefaults.meta.icon}
            previewUri={previews[monthYearVideosDefaults.meta.id]}
          />
        </Pressable>
        <MonthYearPicker
          year={monthYearVideo.year}
          month={monthYearVideo.month}
          onChange={handleMonthYearVideoChange}
        />
      </View>

      <View style={styles.card}>
        <Pressable
          onPress={() =>
            selectedVideoAlbumId &&
            navigation.navigate('Swipe', {
              strategyId: 'album-videos',
              params: { albumId: selectedVideoAlbumId },
            })
          }
        >
          <TitleRow
            title={albumVideosDefaults.meta.title}
            icon={albumVideosDefaults.meta.icon}
            previewUri={selectedVideoAlbumId ? previews[`album-videos-${selectedVideoAlbumId}`] : null}
          />
        </Pressable>
        <AlbumPicker
          albums={videoAlbums}
          selectedAlbumId={selectedVideoAlbumId}
          onChange={handleVideoAlbumChange}
        />
      </View>

      <View style={styles.card}>
        <Pressable
          onPress={() =>
            navigation.navigate('Swipe', {
              strategyId: 'short-videos',
              params: { minSeconds: shortVideoRange[0], maxSeconds: shortVideoRange[1] },
            })
          }
        >
          <TitleRow
            title={shortVideosDefaults.meta.title}
            icon={shortVideosDefaults.meta.icon}
            previewUri={previews[shortVideosDefaults.meta.id]}
          />
        </Pressable>
        <Text style={styles.sliderLabel}>
          {t('categoryPicker.shortVideosLabel', { min: shortVideoRange[0], max: shortVideoRange[1] })}
        </Text>
        <RangeSlider
          minimumValue={0}
          maximumValue={10}
          step={1}
          lowValue={shortVideoRange[0]}
          highValue={shortVideoRange[1]}
          onValuesChange={(low, high) => setShortVideoRange([low, high])}
          onSlidingComplete={persistShortVideoRange}
        />
      </View>

      <View style={styles.card}>
        <Pressable
          onPress={() =>
            navigation.navigate('Swipe', {
              strategyId: 'big-videos',
              params: {
                minBytes: bigVideoRangeMB[0] * 1024 * 1024,
                maxBytes: toBigVideoMaxBytes(bigVideoRangeMB[1]),
              },
            })
          }
        >
          <TitleRow
            title={bigVideosDefaults.meta.title}
            icon={bigVideosDefaults.meta.icon}
            previewUri={previews[bigVideosDefaults.meta.id]}
          />
        </Pressable>
        <Text style={styles.sliderLabel}>
          {bigVideoRangeMB[1] >= BIG_VIDEO_SLIDER_MAX_MB
            ? t('categoryPicker.bigVideosLabelUnbounded', { min: bigVideoRangeMB[0] })
            : t('categoryPicker.bigVideosLabel', { min: bigVideoRangeMB[0], max: bigVideoRangeMB[1] })}
        </Text>
        <RangeSlider
          minimumValue={20}
          maximumValue={BIG_VIDEO_SLIDER_MAX_MB}
          step={20}
          lowValue={bigVideoRangeMB[0]}
          highValue={bigVideoRangeMB[1]}
          onValuesChange={(low, high) => setBigVideoRangeMB([low, high])}
          onSlidingComplete={persistBigVideoRange}
        />
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    container: { padding: 20, gap: 14 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 18,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    sectionHeader: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 8,
      marginBottom: -4,
    },
    sliderLabel: { color: colors.textSecondary, fontSize: 13, marginTop: 12, marginBottom: 8 },
    trashBanner: {
      backgroundColor: colors.cardAlt,
      borderRadius: 18,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    trashBannerText: { color: colors.textPrimary, fontSize: 14, flexShrink: 1 },
    trashButton: {
      backgroundColor: colors.danger,
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    trashButtonText: { color: colors.onBrand, fontSize: 13, fontWeight: '600' },
  });
}
