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
import { RandomPhotosStrategy } from '../strategies/RandomPhotosStrategy';
import { OnThisDayStrategy } from '../strategies/OnThisDayStrategy';
import { OnThisDayVideosStrategy } from '../strategies/OnThisDayVideosStrategy';
import { ScreenshotStrategy } from '../strategies/ScreenshotStrategy';
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
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { getVideoThumbnail } from '../services/VideoThumbnailService';
import StorageMeter from '../components/StorageMeter';
import { CategoriesStackParamList, RootTabParamList } from '../navigation/types';
import { Asset, CategoryMeta } from '../types';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';

/** A representative preview for the category card: the first match's
 * photo URI, or an extracted video frame if the first match is a video
 * (a raw video file URI can't be handed to <Image> — it decodes photos
 * only). Strategies that source their own dataset (Big Files, Short
 * Videos, Duplicate Files, By Month) ignore whatever's passed in, so an
 * empty array is fine for those. Swallows errors rather than throwing —
 * a missing preview just means no thumbnail (falls back to the
 * category's icon), not a broken screen. */
async function getPreviewUri(
  strategy: CategoryStrategy,
  sourceAssets: Asset[]
): Promise<string | VideoThumbnail | null> {
  try {
    const matched = await strategy.match(sourceAssets);
    const first = matched[0];
    if (!first) return null;
    if (first.mediaType === 'video') return getVideoThumbnail(first.uri);
    return first.uri;
  } catch {
    return null;
  }
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
const DEFAULT_BRIGHTNESS_RANGE: [number, number] = [0, 40]; // matches BrightnessStrategy's own defaults
const BRIGHTNESS_RANGE_KEY = '@swipix/brightnessRange';
const MONTH_YEAR_KEY = '@swipix/monthYear';
const MONTH_YEAR_VIDEO_KEY = '@swipix/monthYearVideo';

// Sourceless fallback for when the specific categories below don't have
// much to show (a light library, or one already mostly cleaned up) —
// every remaining photo, shuffled, so there's always a productive "just
// start swiping" option at the top of the list.
const randomPhotosStrategy = new RandomPhotosStrategy();
const onThisDayStrategy = new OnThisDayStrategy();
const onThisDayVideosStrategy = new OnThisDayVideosStrategy();
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
  const [allPhotos, setAllPhotos] = useState<Asset[] | null>(null);
  const [previews, setPreviews] = useState<Record<string, string | VideoThumbnail | null>>({});

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
  }, []);

  useEffect(() => {
    PhotoLibraryService.requestPermission().then((granted) => {
      if (granted) {
        // Only feeds preview thumbnails for the pass-through strategies
        // below (Random/Screenshot/Blurred/Brightness), which just need
        // matched[0] — a small page is enough, and far cheaper than the
        // default 500-asset fetch. A sparse category may occasionally show
        // its fallback icon instead of a real thumbnail even though real
        // matches exist deeper in the library — getPreviewUri already
        // treats a missing preview as normal, not broken, and the actual
        // swipe session (SwipeScreen) always searches properly regardless.
        PhotoLibraryService.getPhotosPage({ first: 150 }).then((page) => setAllPhotos(page.assets));
      }
    });
  }, []);

  const refreshPreview = useCallback((strategy: CategoryStrategy, sourceAssets: Asset[]) => {
    getPreviewUri(strategy, sourceAssets).then((uri) => {
      setPreviews((current) => ({ ...current, [strategy.meta.id]: uri }));
    });
  }, []);

  // One-time preview for every category once the library is loaded —
  // after this, each interactive category's preview only refreshes when
  // its own slider/picker actually changes (below), not on every render.
  useEffect(() => {
    if (!allPhotos) return;
    refreshPreview(onThisDayStrategy, []);
    refreshPreview(onThisDayVideosStrategy, []);
    refreshPreview(randomPhotosStrategy, allPhotos);
    refreshPreview(screenshotStrategy, allPhotos);
    refreshPreview(duplicatesAndSimilarStrategy, []);
    refreshPreview(blurredImagesStrategy, allPhotos);
    refreshPreview(allVideosStrategy, []);
    refreshPreview(new ShortVideosStrategy(shortVideoRange[0], shortVideoRange[1]), []);
    refreshPreview(
      new BigPicturesStrategy(
        bigPictureRangeMB[0] * 1024 * 1024,
        toBigPictureMaxBytes(bigPictureRangeMB[1])
      ),
      []
    );
    refreshPreview(
      new BigVideosStrategy(bigVideoRangeMB[0] * 1024 * 1024, toBigVideoMaxBytes(bigVideoRangeMB[1])),
      []
    );
    refreshPreview(new BrightnessStrategy(brightnessRange[0], brightnessRange[1]), allPhotos);
    refreshPreview(new MonthYearStrategy(monthYear.year, monthYear.month), []);
    refreshPreview(new MonthYearVideosStrategy(monthYearVideo.year, monthYearVideo.month), []);
    // Deliberately only depends on allPhotos — this is the one-time initial
    // load. Re-runs for range/month changes happen at their own slider's
    // onSlidingComplete/onChange instead, not by reacting to this state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPhotos]);

  const refreshTrashCount = useCallback(() => {
    TrashService.getTrash().then((trash) => setTrashCount(trash.length));
  }, []);

  // Refresh every time this screen regains focus (e.g. coming back from a
  // swipe session), not just on first mount.
  useFocusEffect(
    useCallback(() => {
      refreshTrashCount();
    }, [refreshTrashCount])
  );

  const persistShortVideoRange = (low: number, high: number) => {
    AsyncStorage.setItem(SHORT_VIDEO_RANGE_KEY, `${low},${high}`);
    refreshPreview(new ShortVideosStrategy(low, high), []);
  };

  const persistBigPictureRange = (low: number, high: number) => {
    AsyncStorage.setItem(BIG_PICTURE_RANGE_KEY, `${low},${high}`);
    refreshPreview(new BigPicturesStrategy(low * 1024 * 1024, toBigPictureMaxBytes(high)), []);
  };

  const persistBigVideoRange = (low: number, high: number) => {
    AsyncStorage.setItem(BIG_VIDEO_RANGE_KEY, `${low},${high}`);
    refreshPreview(new BigVideosStrategy(low * 1024 * 1024, toBigVideoMaxBytes(high)), []);
  };

  const persistBrightnessRange = (low: number, high: number) => {
    AsyncStorage.setItem(BRIGHTNESS_RANGE_KEY, `${low},${high}`);
    if (allPhotos) refreshPreview(new BrightnessStrategy(low, high), allPhotos);
  };

  const handleMonthYearChange = (year: number, month: number) => {
    setMonthYear({ year, month });
    AsyncStorage.setItem(MONTH_YEAR_KEY, `${year},${month}`);
    refreshPreview(new MonthYearStrategy(year, month), []);
  };

  const handleMonthYearVideoChange = (year: number, month: number) => {
    setMonthYearVideo({ year, month });
    AsyncStorage.setItem(MONTH_YEAR_VIDEO_KEY, `${year},${month}`);
    refreshPreview(new MonthYearVideosStrategy(year, month), []);
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

      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('Swipe', { strategy: onThisDayStrategy })}
      >
        <TitleRow
          title={onThisDayStrategy.meta.title}
          icon={onThisDayStrategy.meta.icon}
          previewUri={previews[onThisDayStrategy.meta.id]}
        />
      </Pressable>

      <Text style={styles.sectionHeader}>{t('categoryPicker.picturesSectionHeader')}</Text>

      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('Swipe', { strategy: randomPhotosStrategy })}
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
              strategy: new MonthYearStrategy(monthYear.year, monthYear.month),
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

      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('Swipe', { strategy: screenshotStrategy })}
      >
        <TitleRow
          title={screenshotStrategy.meta.title}
          icon={screenshotStrategy.meta.icon}
          previewUri={previews[screenshotStrategy.meta.id]}
        />
      </Pressable>

      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('Swipe', { strategy: duplicatesAndSimilarStrategy })}
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
              strategy: new BigPicturesStrategy(
                bigPictureRangeMB[0] * 1024 * 1024,
                toBigPictureMaxBytes(bigPictureRangeMB[1])
              ),
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
        onPress={() => navigation.navigate('Swipe', { strategy: blurredImagesStrategy })}
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
              strategy: new BrightnessStrategy(brightnessRange[0], brightnessRange[1]),
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
        onPress={() => navigation.navigate('Swipe', { strategy: onThisDayVideosStrategy })}
      >
        <TitleRow
          title={onThisDayVideosStrategy.meta.title}
          icon={onThisDayVideosStrategy.meta.icon}
          previewUri={previews[onThisDayVideosStrategy.meta.id]}
        />
      </Pressable>

      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('Swipe', { strategy: allVideosStrategy })}
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
              strategy: new MonthYearVideosStrategy(monthYearVideo.year, monthYearVideo.month),
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
            navigation.navigate('Swipe', {
              strategy: new ShortVideosStrategy(shortVideoRange[0], shortVideoRange[1]),
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
              strategy: new BigVideosStrategy(
                bigVideoRangeMB[0] * 1024 * 1024,
                toBigVideoMaxBytes(bigVideoRangeMB[1])
              ),
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
      padding: 20,
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
