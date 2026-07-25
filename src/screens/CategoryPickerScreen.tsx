import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { getVideoThumbnail } from '../services/VideoThumbnailService';
import StorageMeter from '../components/StorageMeter';
import { CategoriesStackParamList, RootTabParamList } from '../navigation/types';
import { CategoryMeta } from '../types';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';

/** A representative preview for the category card: the asset each
 * strategy's own getPreview() template method finds (see
 * CategoryStrategy), converted to whatever <Image> needs — a plain URI,
 * or an extracted video frame if it's a video (a raw video file URI can't
 * be handed to <Image> directly — it decodes photos only). getPreview()
 * itself never rejects and is already bounded by its own timeout, so
 * there's nothing to catch here. */
async function resolvePreviewDisplay(strategy: CategoryStrategy): Promise<string | VideoThumbnail | null> {
  const asset = await strategy.getPreview();
  if (!asset) return null;
  if (asset.mediaType === 'video') return getVideoThumbnail(asset.uri);
  return asset.uri;
}

// Ordered by real-world impact/confidence: cheap-and-trustworthy signals
// first (metadata-based, no judgment call), stub-based analysis last.
const DEFAULT_SHORT_VIDEO_RANGE: [number, number] = [0, 3]; // matches ShortVideosStrategy's own defaults
const SHORT_VIDEO_RANGE_KEY = '@swipix/shortVideoRange';
const DEFAULT_BIG_PICTURE_RANGE_MB: [number, number] = [20, 200]; // matches BigPicturesStrategy's own defaults
const BIG_PICTURE_RANGE_KEY = '@swipix/bigPictureRangeMB';
// Same "ceiling means and above, not capped" logic as Big Videos below —
// a giant scanned TIFF or uncompressed export could still clear this,
// however unlikely that is compared to video.
const BIG_PICTURE_SLIDER_MAX_MB = 200;
function toBigPictureMaxBytes(highMB: number): number {
  return highMB >= BIG_PICTURE_SLIDER_MAX_MB ? Infinity : highMB * 1024 * 1024;
}
const DEFAULT_BIG_VIDEO_RANGE_MB: [number, number] = [100, 2000]; // matches BigVideosStrategy's own defaults
const BIG_VIDEO_RANGE_KEY = '@swipix/bigVideoRangeMB';
// However high this goes, someone's video is bigger — 8K footage, drone
// clips, screen recordings can all clear 5GB. So the slider's ceiling
// doesn't mean "cap at exactly 5GB," it means "and anything above,"
// via toBigVideoMaxBytes below — a hard cap here would silently exclude
// the very files a "big videos" filter exists to catch.
const BIG_VIDEO_SLIDER_MAX_MB = 5000;
function toBigVideoMaxBytes(highMB: number): number {
  return highMB >= BIG_VIDEO_SLIDER_MAX_MB ? Infinity : highMB * 1024 * 1024;
}
// 70, not 40 — a narrower default range meant very few real-world photos
// qualified as "dark," so a swipe session could take 20+ seconds just to
// accumulate its first page of matches. Matches BrightnessStrategy's own
// default.
const DEFAULT_BRIGHTNESS_RANGE: [number, number] = [0, 70];
const BRIGHTNESS_RANGE_KEY = '@swipix/brightnessRange';
// Blurred Photos and Dark Photos are the only previews that trigger real
// pixel analysis. Sample size and timeout for that now live on each
// strategy itself (see BlurredImagesStrategy/BrightnessStrategy's
// PREVIEW_SAMPLE_SIZE and previewTimeoutMs) — this screen no longer
// manages a shared analysis budget across categories.
const MONTH_YEAR_KEY = '@swipix/monthYear';
const MONTH_YEAR_VIDEO_KEY = '@swipix/monthYearVideo';
const ALBUM_ID_KEY = '@swipix/albumId';
const ALBUM_VIDEO_ID_KEY = '@swipix/albumVideoId';

// Sourceless fallback for when the specific categories below don't have
// much to show (a light library, or one already mostly cleaned up) —
// every remaining photo, shuffled, so there's always a productive "just
// start swiping" option at the top of the list.
const randomPhotosStrategy = new RandomPhotosStrategy();
const screenshotStrategy = new ScreenshotStrategy();
const duplicatesAndSimilarStrategy = new DuplicatesAndSimilarStrategy();
// These four hold onto the strategy instance itself (not a pre-read
// `.meta`) so `.meta.title` is re-evaluated fresh on every render — the
// title comes from a live translation lookup, and freezing it once at
// module load would leave it stuck in whatever language was active on
// first import, surviving a runtime language change.
const allVideosStrategy = new AllVideosStrategy();
const shortVideosDefaults = new ShortVideosStrategy();
const bigPicturesDefaults = new BigPicturesStrategy();
const bigVideosDefaults = new BigVideosStrategy();
const blurredImagesStrategy = new BlurredImagesStrategy();
const brightnessDefaults = new BrightnessStrategy();
const monthYearDefaults = new MonthYearStrategy(0, 0);
const monthYearVideosDefaults = new MonthYearVideosStrategy(0, 0);
// meta.title/icon are constant regardless of which album is selected (see
// AlbumStrategy.meta) — used only for the card header, same role as the
// other *Defaults instances above.
const albumDefaults = new AlbumStrategy('');
const albumVideosDefaults = new AlbumVideosStrategy('');

// Composite because this screen needs to navigate both within its own
// stack (to Swipe) and across to a sibling tab (Trash) when the user
// taps "Review" on the trash banner.
type Props = CompositeScreenProps<
  NativeStackScreenProps<CategoriesStackParamList, 'CategoryPicker'>,
  BottomTabScreenProps<RootTabParamList>
>;

// Layout only (no colors) — safe as a plain module-level StyleSheet,
// unlike the screen's own theme-dependent styles below.
const titleRowStyles = StyleSheet.create({
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  thumbnail: { width: 44, height: 44, borderRadius: 10 },
  thumbnailPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '600', flexShrink: 1 },
  chevron: { fontSize: 22, fontWeight: '400' },
});

/** Same title + chevron affordance on every card, whether or not it also
 * has a slider — one consistent signifier for "tap this to go swiping."
 * previewUri is a representative photo (or, for video-first categories,
 * an extracted video frame) for the category; when there's no match yet
 * (or none at all), falls back to the category's own `meta.icon` on a
 * plain background rather than an empty square. Uses expo-image's
 * <Image> rather than React Native's core one — only expo-image can
 * render a video-frame reference (a native image object, not a URI)
 * alongside a plain string URI through the same `source` prop.
 * Reads the theme itself rather than taking styles as a prop — it's a
 * sibling function, not nested, so it can't close over the parent's
 * per-render `styles`. */
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
      if (stored != null) setSelectedAlbumId(stored);
    });
    AsyncStorage.getItem(ALBUM_VIDEO_ID_KEY).then((stored) => {
      if (stored != null) setSelectedVideoAlbumId(stored);
    });
  }, []);

  useEffect(() => {
    PhotoLibraryService.requestPermission().then((granted) => {
      if (__DEV__ && !granted) console.warn('CategoryPickerScreen: photo permission not granted, previews will never load');
      setPermissionGranted(granted);
    });
  }, []);

  // Loaded once permission is confirmed, alongside everything else — not
  // gated behind the user ever opening either album picker, so both "By
  // Album" cards already have something to preview/swipe the first time
  // they're seen. Two independent lists, not one shared one: a folder
  // like a GoPro import can be all-video, and showing it in the photo
  // picker left AlbumStrategy with nothing to ever find there — each list
  // is scoped to albums that actually contain that media type (see
  // PhotoLibraryService.getAlbums). Two independent selections too, same
  // as monthYear/monthYearVideo already are — you might want photos from
  // one album and videos from a different one. Each defaults to its own
  // list's first album (alphabetically) only if nothing was already
  // persisted from a previous session.
  useEffect(() => {
    if (!permissionGranted) return;
    PhotoLibraryService.getAlbums('photo').then((fetched) => {
      setPhotoAlbums(fetched);
      setSelectedAlbumId((current) => current ?? fetched[0]?.id ?? null);
    });
    PhotoLibraryService.getAlbums('video').then((fetched) => {
      setVideoAlbums(fetched);
      setSelectedVideoAlbumId((current) => current ?? fetched[0]?.id ?? null);
    });
  }, [permissionGranted]);

  // Each category resolves its own preview independently — no shared
  // fetch for one category's slow or failed lookup to ever block or break
  // another's (see CategoryStrategy.getPreview, which every strategy below
  // implements its own fast, targeted version of — most a single native
  // query, the few that genuinely need analysis bounded by their own
  // timeout). Confirmed reachable: the previous shared-fetch design meant
  // a single bad asset anywhere in one combined 150-item page silently
  // broke every category's preview at once on a real device.
  const refreshPreview = useCallback((strategy: CategoryStrategy) => {
    resolvePreviewDisplay(strategy).then((display) => {
      setPreviews((current) => ({ ...current, [strategy.meta.id]: display }));
    });
  }, []);

  // Every category's preview, fired together but resolved independently
  // (see refreshPreview above). Re-invoked both on first load and on every
  // later focus (below) — confirmed reachable: previews that failed once
  // (e.g. right after a large native deletion, while iOS's Photos index
  // may still be settling) used to never get another chance until the
  // whole app restarted, since this used to run only once per mount.
  const refreshAllPreviews = useCallback(() => {
    refreshPreview(randomPhotosStrategy);
    refreshPreview(screenshotStrategy);
    refreshPreview(duplicatesAndSimilarStrategy);
    refreshPreview(blurredImagesStrategy);
    refreshPreview(allVideosStrategy);
    refreshPreview(new ShortVideosStrategy(shortVideoRange[0], shortVideoRange[1]));
    refreshPreview(
      new BigPicturesStrategy(
        bigPictureRangeMB[0] * 1024 * 1024,
        toBigPictureMaxBytes(bigPictureRangeMB[1])
      )
    );
    refreshPreview(
      new BigVideosStrategy(bigVideoRangeMB[0] * 1024 * 1024, toBigVideoMaxBytes(bigVideoRangeMB[1]))
    );
    refreshPreview(new BrightnessStrategy(brightnessRange[0], brightnessRange[1]));
    refreshPreview(new MonthYearStrategy(monthYear.year, monthYear.month));
    refreshPreview(new MonthYearVideosStrategy(monthYearVideo.year, monthYearVideo.month));
    if (selectedAlbumId) refreshPreview(new AlbumStrategy(selectedAlbumId));
    if (selectedVideoAlbumId) refreshPreview(new AlbumVideosStrategy(selectedVideoAlbumId));
  }, [
    refreshPreview,
    shortVideoRange,
    bigPictureRangeMB,
    bigVideoRangeMB,
    brightnessRange,
    monthYear,
    monthYearVideo,
    selectedAlbumId,
    selectedVideoAlbumId,
  ]);

  useEffect(() => {
    if (permissionGranted) refreshAllPreviews();
    // Deliberately only depends on permissionGranted — this fires once
    // permission first resolves true; every later refresh (range/month
    // changes, regaining focus) is handled by its own trigger below, not
    // by reacting to refreshAllPreviews identity changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionGranted]);

  // The album list resolves later than permissionGranted (its own async
  // fetch — see the effect above), so the very first refreshAllPreviews()
  // run above almost always fires before either selection exists yet and
  // skips both album previews. Without this, "By Album"/"Videos by Album"
  // would show nothing until the user happened to leave and return to
  // this screen.
  useEffect(() => {
    if (!selectedAlbumId) return;
    refreshPreview(new AlbumStrategy(selectedAlbumId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAlbumId]);

  useEffect(() => {
    if (!selectedVideoAlbumId) return;
    refreshPreview(new AlbumVideosStrategy(selectedVideoAlbumId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVideoAlbumId]);

  const refreshTrashCount = useCallback(() => {
    TrashService.getTrash().then((trash) => setTrashCount(trash.length));
  }, []);

  // Refresh every time this screen regains focus — e.g. coming back from
  // Trash after clearing it, or from a swipe session — not just on first
  // mount. permissionGranted is checked rather than relied on implicitly:
  // the very first focus event fires before permission has resolved, and
  // the effect above already covers that first real load once it does.
  useFocusEffect(
    useCallback(() => {
      refreshTrashCount();
      if (permissionGranted) refreshAllPreviews();
    }, [refreshTrashCount, permissionGranted, refreshAllPreviews])
  );

  const persistShortVideoRange = (low: number, high: number) => {
    AsyncStorage.setItem(SHORT_VIDEO_RANGE_KEY, `${low},${high}`);
    refreshPreview(new ShortVideosStrategy(low, high));
  };

  const persistBigPictureRange = (low: number, high: number) => {
    AsyncStorage.setItem(BIG_PICTURE_RANGE_KEY, `${low},${high}`);
    refreshPreview(new BigPicturesStrategy(low * 1024 * 1024, toBigPictureMaxBytes(high)));
  };

  const persistBigVideoRange = (low: number, high: number) => {
    AsyncStorage.setItem(BIG_VIDEO_RANGE_KEY, `${low},${high}`);
    refreshPreview(new BigVideosStrategy(low * 1024 * 1024, toBigVideoMaxBytes(high)));
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
