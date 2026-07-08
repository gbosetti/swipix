import React, { useEffect, useState } from 'react';
import { Text, Pressable, StyleSheet, ScrollView, View } from 'react-native';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BrightnessStrategy } from '../strategies/BrightnessStrategy';
import { ScreenshotStrategy } from '../strategies/ScreenshotStrategy';
import { RootStackParamList } from '../navigation/types';

const DEFAULT_BRIGHTNESS_THRESHOLD = 40; // matches BrightnessStrategy's own default
const BRIGHTNESS_THRESHOLD_KEY = '@swipix/brightnessThreshold';
const brightnessMeta = new BrightnessStrategy().meta;
const screenshotStrategy = new ScreenshotStrategy();

type Props = NativeStackScreenProps<RootStackParamList, 'CategoryPicker'>;

export default function CategoryPickerScreen({ navigation }: Props) {
  const [brightnessThreshold, setBrightnessThreshold] = useState(DEFAULT_BRIGHTNESS_THRESHOLD);

  useEffect(() => {
    AsyncStorage.getItem(BRIGHTNESS_THRESHOLD_KEY).then((stored) => {
      if (stored != null) setBrightnessThreshold(Number(stored));
    });
  }, []);

  const persistThreshold = (value: number) => {
    AsyncStorage.setItem(BRIGHTNESS_THRESHOLD_KEY, String(value));
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>What do you want to clean up?</Text>

      <View style={styles.card}>
        <Pressable
          onPress={() =>
            navigation.navigate('Swipe', {
              strategy: new BrightnessStrategy(brightnessThreshold),
            })
          }
        >
          <Text style={styles.title}>{brightnessMeta.title}</Text>
        </Pressable>
        <Text style={styles.sliderLabel}>
          Flag photos darker than {brightnessThreshold}/255
        </Text>
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
  container: { padding: 20, paddingTop: 60, gap: 14 },
  header: { fontSize: 28, fontWeight: '700', marginBottom: 20 },
  card: {
    backgroundColor: '#1c1c1e',
    borderRadius: 18,
    padding: 20,
  },
  title: { color: 'white', fontSize: 18, fontWeight: '600' },
  sliderLabel: { color: '#8e8e93', fontSize: 13, marginTop: 12 },
});
