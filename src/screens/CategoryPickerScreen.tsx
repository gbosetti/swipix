import React, { useCallback, useEffect, useState } from 'react';
import { Text, Pressable, StyleSheet, ScrollView, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import RangeSlider from '../components/RangeSlider';
import { ScreenshotStrategy } from '../strategies/ScreenshotStrategy';
import { SimilarPicturesStrategy } from '../strategies/SimilarPicturesStrategy';
import { ExactDuplicatesStrategy } from '../strategies/ExactDuplicatesStrategy';
import { ShortVideosStrategy } from '../strategies/ShortVideosStrategy';
import { BigFilesStrategy } from '../strategies/BigFilesStrategy';
import { BlurredImagesStrategy } from '../strategies/BlurredImagesStrategy';
import { BrightnessStrategy } from '../strategies/BrightnessStrategy';
import { TrashService } from '../services/TrashService';
import StorageMeter from '../components/StorageMeter';
import { CategoriesStackParamList, RootTabParamList } from '../navigation/types';
import { Colors } from '../theme/colors';

// Ordered by real-world impact/confidence: cheap-and-trustworthy signals
// first (metadata-based, no judgment call), stub-based analysis last.
const DEFAULT_SHORT_VIDEO_RANGE: [number, number] = [0, 3]; // matches ShortVideosStrategy's own defaults
const SHORT_VIDEO_RANGE_KEY = '@swipix/shortVideoRange';
const DEFAULT_BIG_FILE_RANGE_MB: [number, number] = [20, 200]; // matches BigFilesStrategy's own defaults
const BIG_FILE_RANGE_KEY = '@swipix/bigFileRangeMB';
const DEFAULT_BRIGHTNESS_RANGE: [number, number] = [0, 40]; // matches BrightnessStrategy's own defaults
const BRIGHTNESS_RANGE_KEY = '@swipix/brightnessRange';

const screenshotStrategy = new ScreenshotStrategy();
const similarPicturesStrategy = new SimilarPicturesStrategy();
const exactDuplicatesStrategy = new ExactDuplicatesStrategy();
const shortVideosMeta = new ShortVideosStrategy().meta;
const bigFilesMeta = new BigFilesStrategy().meta;
const blurredImagesStrategy = new BlurredImagesStrategy();
const brightnessMeta = new BrightnessStrategy().meta;

// Composite because this screen needs to navigate both within its own
// stack (to Swipe) and across to a sibling tab (Trash) when the user
// taps "Review" on the trash banner.
type Props = CompositeScreenProps<
  NativeStackScreenProps<CategoriesStackParamList, 'CategoryPicker'>,
  BottomTabScreenProps<RootTabParamList>
>;

/** Same title + chevron affordance on every card, whether or not it also
 * has a slider — one consistent signifier for "tap this to go swiping." */
function TitleRow({ title }: { title: string }) {
  return (
    <View style={styles.titleRow}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.chevron}>›</Text>
    </View>
  );
}

export default function CategoryPickerScreen({ navigation }: Props) {
  const [shortVideoRange, setShortVideoRange] = useState(DEFAULT_SHORT_VIDEO_RANGE);
  const [bigFileRangeMB, setBigFileRangeMB] = useState(DEFAULT_BIG_FILE_RANGE_MB);
  const [brightnessRange, setBrightnessRange] = useState(DEFAULT_BRIGHTNESS_RANGE);
  const [trashCount, setTrashCount] = useState(0);

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
    loadRange(BIG_FILE_RANGE_KEY, setBigFileRangeMB);
    loadRange(BRIGHTNESS_RANGE_KEY, setBrightnessRange);
  }, []);

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
  };

  const persistBigFileRange = (low: number, high: number) => {
    AsyncStorage.setItem(BIG_FILE_RANGE_KEY, `${low},${high}`);
  };

  const persistBrightnessRange = (low: number, high: number) => {
    AsyncStorage.setItem(BRIGHTNESS_RANGE_KEY, `${low},${high}`);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <StorageMeter />

      {trashCount > 0 && (
        <View style={styles.trashBanner}>
          <Text style={styles.trashBannerText}>
            🗑 {trashCount} photo{trashCount === 1 ? '' : 's'} pending deletion
          </Text>
          <Pressable onPress={() => navigation.navigate('TrashTab')} style={styles.trashButton}>
            <Text style={styles.trashButtonText}>Review</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.sectionHeader}>Categories</Text>

      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('Swipe', { strategy: screenshotStrategy })}
      >
        <TitleRow title={screenshotStrategy.meta.title} />
      </Pressable>

      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('Swipe', { strategy: similarPicturesStrategy })}
      >
        <TitleRow title={similarPicturesStrategy.meta.title} />
      </Pressable>

      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('Swipe', { strategy: exactDuplicatesStrategy })}
      >
        <TitleRow title={exactDuplicatesStrategy.meta.title} />
      </Pressable>

      <View style={styles.card}>
        <Pressable
          onPress={() =>
            navigation.navigate('Swipe', {
              strategy: new ShortVideosStrategy(shortVideoRange[0], shortVideoRange[1]),
            })
          }
        >
          <TitleRow title={shortVideosMeta.title} />
        </Pressable>
        <Text style={styles.sliderLabel}>
          Flag videos between {shortVideoRange[0]}s and {shortVideoRange[1]}s long
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
              strategy: new BigFilesStrategy(
                bigFileRangeMB[0] * 1024 * 1024,
                bigFileRangeMB[1] * 1024 * 1024
              ),
            })
          }
        >
          <TitleRow title={bigFilesMeta.title} />
        </Pressable>
        <Text style={styles.sliderLabel}>
          Flag photos and videos between {bigFileRangeMB[0]} and {bigFileRangeMB[1]} MB
        </Text>
        <RangeSlider
          minimumValue={5}
          maximumValue={200}
          step={5}
          lowValue={bigFileRangeMB[0]}
          highValue={bigFileRangeMB[1]}
          onValuesChange={(low, high) => setBigFileRangeMB([low, high])}
          onSlidingComplete={persistBigFileRange}
        />
      </View>

      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('Swipe', { strategy: blurredImagesStrategy })}
      >
        <TitleRow title={blurredImagesStrategy.meta.title} />
      </Pressable>

      <View style={styles.card}>
        <Pressable
          onPress={() =>
            navigation.navigate('Swipe', {
              strategy: new BrightnessStrategy(brightnessRange[0], brightnessRange[1]),
            })
          }
        >
          <TitleRow title={brightnessMeta.title} />
        </Pressable>
        <Text style={styles.sliderLabel}>
          Flag photos between {brightnessRange[0]} and {brightnessRange[1]}/255 brightness
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, gap: 14 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 20,
  },
  sectionHeader: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: -4,
  },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: Colors.textPrimary, fontSize: 18, fontWeight: '600' },
  chevron: { color: Colors.textSecondary, fontSize: 22, fontWeight: '400' },
  sliderLabel: { color: Colors.textSecondary, fontSize: 13, marginTop: 12, marginBottom: 8 },
  trashBanner: {
    backgroundColor: Colors.cardAlt,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  trashBannerText: { color: Colors.textPrimary, fontSize: 14, flexShrink: 1 },
  trashButton: {
    backgroundColor: Colors.danger,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  trashButtonText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },
});
