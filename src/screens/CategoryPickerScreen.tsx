import React, { useCallback, useEffect, useState } from 'react';
import { Text, Pressable, StyleSheet, ScrollView, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import RangeSlider from '../components/RangeSlider';
import { BrightnessStrategy } from '../strategies/BrightnessStrategy';
import { ScreenshotStrategy } from '../strategies/ScreenshotStrategy';
import { BigFilesStrategy } from '../strategies/BigFilesStrategy';
import { BlurredImagesStrategy } from '../strategies/BlurredImagesStrategy';
import { SimilarPicturesStrategy } from '../strategies/SimilarPicturesStrategy';
import { TrashService } from '../services/TrashService';
import StorageMeter from '../components/StorageMeter';
import { CategoriesStackParamList, RootTabParamList } from '../navigation/types';

const DEFAULT_BRIGHTNESS_RANGE: [number, number] = [0, 40]; // matches BrightnessStrategy's own defaults
const BRIGHTNESS_RANGE_KEY = '@swipix/brightnessRange';
const DEFAULT_BIG_FILE_RANGE_MB: [number, number] = [20, 200]; // matches BigFilesStrategy's own defaults
const BIG_FILE_RANGE_KEY = '@swipix/bigFileRangeMB';

const brightnessMeta = new BrightnessStrategy().meta;
const screenshotStrategy = new ScreenshotStrategy();
const bigFilesMeta = new BigFilesStrategy().meta;
const blurredImagesStrategy = new BlurredImagesStrategy();
const similarPicturesStrategy = new SimilarPicturesStrategy();

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
  const [brightnessRange, setBrightnessRange] = useState(DEFAULT_BRIGHTNESS_RANGE);
  const [bigFileRangeMB, setBigFileRangeMB] = useState(DEFAULT_BIG_FILE_RANGE_MB);
  const [trashCount, setTrashCount] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(BRIGHTNESS_RANGE_KEY).then((stored) => {
      if (stored != null) {
        const [low, high] = stored.split(',').map(Number);
        setBrightnessRange([low, high]);
      }
    });
    AsyncStorage.getItem(BIG_FILE_RANGE_KEY).then((stored) => {
      if (stored != null) {
        const [low, high] = stored.split(',').map(Number);
        setBigFileRangeMB([low, high]);
      }
    });
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

  const persistBrightnessRange = (low: number, high: number) => {
    AsyncStorage.setItem(BRIGHTNESS_RANGE_KEY, `${low},${high}`);
  };

  const persistBigFileRange = (low: number, high: number) => {
    AsyncStorage.setItem(BIG_FILE_RANGE_KEY, `${low},${high}`);
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

      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('Swipe', { strategy: screenshotStrategy })}
      >
        <TitleRow title={screenshotStrategy.meta.title} />
      </Pressable>

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

      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('Swipe', { strategy: similarPicturesStrategy })}
      >
        <TitleRow title={similarPicturesStrategy.meta.title} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  container: { padding: 20, gap: 14 },
  card: {
    backgroundColor: '#1c1c1e',
    borderRadius: 18,
    padding: 20,
  },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: 'white', fontSize: 18, fontWeight: '600' },
  chevron: { color: '#8e8e93', fontSize: 22, fontWeight: '400' },
  sliderLabel: { color: '#8e8e93', fontSize: 13, marginTop: 12, marginBottom: 8 },
  trashBanner: {
    backgroundColor: '#2c1c1e',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  trashBannerText: { color: 'white', fontSize: 14, flexShrink: 1 },
  trashButton: {
    backgroundColor: '#ff3b30',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  trashButtonText: { color: 'white', fontSize: 13, fontWeight: '600' },
});
