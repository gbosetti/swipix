import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, PanResponder, LayoutChangeEvent, StyleSheet } from 'react-native';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';

interface RangeSliderProps {
  minimumValue: number;
  maximumValue: number;
  step?: number;
  lowValue: number;
  highValue: number;
  onValuesChange: (low: number, high: number) => void;
  onSlidingComplete?: (low: number, high: number) => void;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
}

const THUMB_SIZE = 24;
const TRACK_HEIGHT = 4;
const CONTAINER_HEIGHT = 32;

/**
 * A minimal two-thumb range slider, hand-built with PanResponder (same
 * technique as SwipeDeck) rather than a third-party dependency.
 *
 * @remarks
 * Tracks gesture.dx, not absolute touch position — an earlier version
 * used View.measure() for that, which was unreliable enough to make the
 * thumbs undraggable. PanResponder callbacks read from refs rather than
 * props/closures, since the instance is created once via useRef and
 * would otherwise capture stale values.
 */
function RangeSlider({
  minimumValue,
  maximumValue,
  step = 1,
  lowValue,
  highValue,
  onValuesChange,
  onSlidingComplete,
  minimumTrackTintColor,
  maximumTrackTintColor,
  thumbTintColor,
}: RangeSliderProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const resolvedMinTintColor = minimumTrackTintColor ?? colors.accent;
  const resolvedMaxTintColor = maximumTrackTintColor ?? colors.trackInactive;
  const resolvedThumbTintColor = thumbTintColor ?? colors.accent;
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);

  const lowValueRef = useRef(lowValue);
  lowValueRef.current = lowValue;
  const highValueRef = useRef(highValue);
  highValueRef.current = highValue;
  const onValuesChangeRef = useRef(onValuesChange);
  onValuesChangeRef.current = onValuesChange;
  const onSlidingCompleteRef = useRef(onSlidingComplete);
  onSlidingCompleteRef.current = onSlidingComplete;

  const fractionToValue = useCallback(
    (fraction: number) => {
      const raw = minimumValue + fraction * (maximumValue - minimumValue);
      const stepped = Math.round(raw / step) * step;
      return Math.min(maximumValue, Math.max(minimumValue, stepped));
    },
    [minimumValue, maximumValue, step]
  );

  const handleLayout = (e: LayoutChangeEvent) => {
    trackWidthRef.current = e.nativeEvent.layout.width;
    setTrackWidth(e.nativeEvent.layout.width);
  };

  const makeResponder = (thumb: 'low' | 'high') => {
    let startFraction = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const value = thumb === 'low' ? lowValueRef.current : highValueRef.current;
        startFraction = (value - minimumValue) / (maximumValue - minimumValue);
      },
      onPanResponderMove: (_, gesture) => {
        if (trackWidthRef.current === 0) {
          return;
        }
        const fraction = Math.min(1, Math.max(0, startFraction + gesture.dx / trackWidthRef.current));
        const value = fractionToValue(fraction);
        if (thumb === 'low') {
          const clamped = Math.min(value, highValueRef.current - step);
          onValuesChangeRef.current(Math.max(minimumValue, clamped), highValueRef.current);
        } else {
          const clamped = Math.max(value, lowValueRef.current + step);
          onValuesChangeRef.current(lowValueRef.current, Math.min(maximumValue, clamped));
        }
      },
      onPanResponderRelease: () => {
        onSlidingCompleteRef.current?.(lowValueRef.current, highValueRef.current);
      },
    });
  };

  const lowResponder = useRef(makeResponder('low')).current;
  const highResponder = useRef(makeResponder('high')).current;

  const lowFraction = (lowValue - minimumValue) / (maximumValue - minimumValue);
  const highFraction = (highValue - minimumValue) / (maximumValue - minimumValue);

  return (
    <View style={styles.container}>
      <View
        style={[styles.track, { backgroundColor: resolvedMaxTintColor }]}
        onLayout={handleLayout}
      >
        <View
          style={[
            styles.fill,
            {
              left: `${lowFraction * 100}%`,
              right: `${(1 - highFraction) * 100}%`,
              backgroundColor: resolvedMinTintColor,
            },
          ]}
        />
      </View>
      <View
        style={[
          styles.thumb,
          { left: lowFraction * trackWidth - THUMB_SIZE / 2, backgroundColor: resolvedThumbTintColor },
        ]}
        {...lowResponder.panHandlers}
      />
      <View
        style={[
          styles.thumb,
          { left: highFraction * trackWidth - THUMB_SIZE / 2, backgroundColor: resolvedThumbTintColor },
        ]}
        {...highResponder.panHandlers}
      />
    </View>
  );
}

export default React.memo(RangeSlider);

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { height: CONTAINER_HEIGHT, justifyContent: 'center' },
    track: { height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2, overflow: 'hidden' },
    fill: { position: 'absolute', height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2 },
    thumb: {
      position: 'absolute',
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: THUMB_SIZE / 2,
      top: (CONTAINER_HEIGHT - THUMB_SIZE) / 2,
      shadowColor: colors.background,
      shadowOpacity: 0.3,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: 3,
    },
  });
}
