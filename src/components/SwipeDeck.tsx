import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Animated, PanResponder } from 'react-native';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.28;

type SwipeDirection = 'left' | 'right';

interface SwipeDeckProps<T extends { id: string }> {
  data: T[];
  /** `isTop` is true only for the frontmost, interactive card — lets
   * renderCard skip expensive work (like playing a video) for the cards
   * stacked behind it. */
  renderCard: (item: T, isTop: boolean) => React.ReactNode;
  onSwipeLeft?: (item: T) => void;
  onSwipeRight?: (item: T) => void;
  onEmpty?: () => void;
  /** Shown as a fading stamp on the card while dragging right. */
  rightLabel?: string;
  /** Shown as a fading stamp on the card while dragging left. */
  leftLabel?: string;
  /** Bump this (e.g. a counter you increment) to step back to the
   * previous card. A prop-driven trigger rather than an imperative ref —
   * the caller already knows whether undo is valid (it owns the swipe
   * history), so SwipeDeck just needs to be told "go back one," not
   * asked to report its own state back up. */
  undoSignal?: number;
}

/**
 * SwipeDeck is deliberately generic: it takes `data` (any array) and a
 * `renderCard` function, plus onSwipeLeft/onSwipeRight callbacks.
 *
 * It does NOT know about photos, trash, or categories. This means the
 * exact same component could power a totally different feature later
 * (e.g. swiping through contacts to merge duplicates) with zero changes —
 * that's the reusability payoff of keeping UI mechanics separate from
 * domain logic (separate what changes for different reasons).
 */
export default function SwipeDeck<T extends { id: string }>({
  data,
  renderCard,
  onSwipeLeft,
  onSwipeRight,
  onEmpty,
  rightLabel,
  leftLabel,
  undoSignal,
}: SwipeDeckProps<T>) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const position = useRef(new Animated.ValueXY()).current;
  const indexRef = useRef(0);
  const [, forceRender] = React.useReducer((x) => x + 1, 0);
  const prevUndoSignal = useRef(undoSignal);

  // The PanResponder below is built once via `useRef` and never rebuilt, so
  // its handlers close over whichever `data`/callback props existed at
  // mount — normally invisible since `data` never changed identity after
  // the first render. Now that SwipeScreen can append pages to `data`
  // while this stays mounted, `onSwipeComplete` must read the CURRENT
  // props, not the frozen ones — this ref is kept in sync on every render
  // for exactly that.
  const latest = useRef({ data, onSwipeLeft, onSwipeRight, onEmpty });
  latest.current = { data, onSwipeLeft, onSwipeRight, onEmpty };

  useEffect(() => {
    if (undoSignal !== prevUndoSignal.current && indexRef.current > 0) {
      indexRef.current -= 1;
      position.setValue({ x: 0, y: 0 });
      forceRender();
    }
    prevUndoSignal.current = undoSignal;
  }, [undoSignal, position]);

  // useNativeDriver: false here, deliberately — a PanResponder's move
  // handler always runs on the JS thread anyway (gesture recognition itself
  // is JS-computed), so there's no native-driver optimization to gain, and
  // Animated.event's native-driver mode returns an AnimatedEvent object
  // rather than a callable function — PanResponder requires a real
  // function and throws ("config.onPanResponderMove is not a function")
  // otherwise, confirmed on-device. forceSwipe/resetPosition below are also
  // kept non-native for the same value, since mixing a native-driven
  // release animation with JS-driven setValue() calls on the next drag is
  // what caused the freeze-after-first-swipe regression. transform-based
  // styling (getCardStyle below) is still what fixes the actual jank —
  // it's cheaper than layout (left/top) regardless of native driver.
  const handlePanMove = useRef(
    Animated.event([null, { dx: position.x, dy: position.y }], { useNativeDriver: false })
  ).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: handlePanMove,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          forceSwipe('right');
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          forceSwipe('left');
        } else {
          resetPosition();
        }
      },
    })
  ).current;

  const forceSwipe = (direction: SwipeDirection) => {
    const x = direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
    Animated.timing(position, {
      toValue: { x, y: 0 },
      duration: 220,
      useNativeDriver: false,
    }).start(() => onSwipeComplete(direction));
  };

  const onSwipeComplete = (direction: SwipeDirection) => {
    const current = latest.current;
    const item = current.data[indexRef.current];
    if (direction === 'right') {
      current.onSwipeRight?.(item);
    } else {
      current.onSwipeLeft?.(item);
    }
    position.setValue({ x: 0, y: 0 });
    indexRef.current += 1;
    if (indexRef.current >= current.data.length) {
      current.onEmpty?.();
    }
    forceRender();
  };

  const resetPosition = () => {
    Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
  };

  // transform-based positioning (translateX/Y + rotate), not
  // position.getLayout()'s left/top — layout properties trigger a full
  // layout recalculation on every frame, which read as stuttery or
  // "freezing" on a real device even under the JS driver (confirmed
  // on-device). transform doesn't require layout, so it's noticeably
  // cheaper regardless of native vs. JS driver — see the note above
  // panResponder for why this whole gesture stays JS-driven
  // (useNativeDriver: false) rather than native-driven.
  const getCardStyle = () => {
    const rotate = position.x.interpolate({
      inputRange: [-SCREEN_WIDTH * 1.5, 0, SCREEN_WIDTH * 1.5],
      outputRange: ['-18deg', '0deg', '18deg'],
    });
    return { transform: [...position.getTranslateTransform(), { rotate }] };
  };

  const rightStampOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const leftStampOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  if (indexRef.current >= data.length) return null;

  return (
    <View style={styles.container}>
      {data
        .slice(indexRef.current, indexRef.current + 3)
        .reverse()
        .map((item, i, visible) => {
          const isTop = i === visible.length - 1;
          return isTop ? (
            <Animated.View
              key={item.id}
              style={[styles.card, getCardStyle()]}
              {...panResponder.panHandlers}
            >
              {renderCard(item, true)}
              {rightLabel && (
                <Animated.View
                  style={[styles.stamp, styles.rightStamp, { opacity: rightStampOpacity }]}
                >
                  <Text style={[styles.stampText, styles.rightStampText]}>{rightLabel}</Text>
                </Animated.View>
              )}
              {leftLabel && (
                <Animated.View
                  style={[styles.stamp, styles.leftStamp, { opacity: leftStampOpacity }]}
                >
                  <Text style={[styles.stampText, styles.leftStampText]}>{leftLabel}</Text>
                </Animated.View>
              )}
            </Animated.View>
          ) : (
            <Animated.View key={item.id} style={[styles.card, { top: 6 * i, opacity: 0.7 }]}>
              {renderCard(item, false)}
            </Animated.View>
          );
        })}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    // container above is already flex:1 (all space left after SwipeScreen's
    // status bar and hint row) — sizing the card much closer to that full
    // area, instead of 75% of it, both makes the photo bigger and moves it
    // away from looking nearly square, since width was already 90% of the
    // screen while height had a lot of headroom unused.
    card: { position: 'absolute', width: SCREEN_WIDTH * 0.94, height: '94%' },
    stamp: {
      position: 'absolute',
      top: 32,
      borderWidth: 3,
      borderRadius: 10,
      paddingVertical: 6,
      paddingHorizontal: 14,
    },
    rightStamp: { left: 20, borderColor: colors.success, transform: [{ rotate: '-12deg' }] },
    leftStamp: { right: 20, borderColor: colors.danger, transform: [{ rotate: '12deg' }] },
    stampText: { fontSize: 26, fontWeight: '800', letterSpacing: 1 },
    rightStampText: { color: colors.success },
    leftStampText: { color: colors.danger },
  });
}
