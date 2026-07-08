import React, { useCallback, useEffect, useState } from 'react';
import { Text, Pressable, StyleSheet, ScrollView, View } from 'react-native';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BrightnessStrategy } from '../strategies/BrightnessStrategy';
import { ScreenshotStrategy } from '../strategies/ScreenshotStrategy';
import { TrashService } from '../services/TrashService';
import { RootStackParamList } from '../navigation/types';

const DEFAULT_BRIGHTNESS_THRESHOLD = 40; // matches BrightnessStrategy's own default
const BRIGHTNESS_THRESHOLD_KEY = '@swipix/brightnessThreshold';
const brightnessMeta = new BrightnessStrategy().meta;
const screenshotStrategy = new ScreenshotStrategy();

type Props = NativeStackScreenProps<RootStackParamList, 'CategoryPicker'>;

export default function CategoryPickerScreen({ navigation }: Props) {
  const [brightnessThreshold, setBrightnessThreshold] = useState(DEFAULT_BRIGHTNESS_THRESHOLD);
  const [trashCount, setTrashCount] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(BRIGHTNESS_THRESHOLD_KEY).then((stored) => {
      if (stored != null) setBrightnessThreshold(Number(stored));
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

  const persistThreshold = (value: number) => {
    AsyncStorage.setItem(BRIGHTNESS_THRESHOLD_KEY, String(value));
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {trashCount > 0 && (
        <View style={styles.trashBanner}>
          <Text style={styles.trashBannerText}>
            🗑 {trashCount} photo{trashCount === 1 ? '' : 's'} pending deletion
          </Text>
          <Pressable onPress={() => navigation.navigate('Trash')} style={styles.trashButton}>
            <Text style={styles.trashButtonText}>Review</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.card}>
        <Pressable
          onPress={() =>
            navigation.navigate('Swipe', {
              strategy: new BrightnessStrategy(brightnessThreshold),
            })
          }
        >
          <Text style={styles.title}>{brightnessMeta.title}</Text>
          <Text style={styles.sliderLabel}>
            Flag photos darker than {brightnessThreshold}/255
          </Text>
        </Pressable>
        <Slider
          minimumValue={0}
          maximumValue={255}
          step={5}
          value={brightnessThreshold}
          onValueChange={setBrightnessThreshold}
          onSlidingComplete={persistThreshold}
          minimumTrackTintColor="#0a84ff"
          maximumTrackTintColor="#3a3a3c"
          thumbTintColor="#0a84ff"
        />
      </View>

      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('Swipe', { strategy: screenshotStrategy })}
      >
        <Text style={styles.title}>{screenshotStrategy.meta.title}</Text>
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
  title: { color: 'white', fontSize: 18, fontWeight: '600' },
  sliderLabel: { color: '#8e8e93', fontSize: 13, marginTop: 12 },
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
