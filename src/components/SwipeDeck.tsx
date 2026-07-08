import React, { useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder } from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.28;

type SwipeDirection = 'left' | 'right';

interface SwipeDeckProps<T extends { id: string }> {
  data: T[];
  renderCard: (item: T) => React.ReactNode;
  onSwipeLeft?: (item: T) => void;
  onSwipeRight?: (item: T) => void;
  onEmpty?: () => void;
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
}: SwipeDeckProps<T>) {
  const position = useRef(new Animated.ValueXY()).current;
  const indexRef = useRef(0);
  const [, forceRender] = React.useReducer((x) => x + 1, 0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy });
      },
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
    const item = data[indexRef.current];
    if (direction === 'right') {
      onSwipeRight?.(item);
    } else {
      onSwipeLeft?.(item);
    }
    position.setValue({ x: 0, y: 0 });
    indexRef.current += 1;
    if (indexRef.current >= data.length) {
      onEmpty?.();
    }
    forceRender();
  };

  const resetPosition = () => {
    Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
  };

  const getCardStyle = () => {
    const rotate = position.x.interpolate({
      inputRange: [-SCREEN_WIDTH * 1.5, 0, SCREEN_WIDTH * 1.5],
      outputRange: ['-18deg', '0deg', '18deg'],
    });
    return { ...position.getLayout(), transform: [{ rotate }] };
  };

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
              {renderCard(item)}
            </Animated.View>
          ) : (
            <Animated.View key={item.id} style={[styles.card, { top: 6 * i, opacity: 0.7 }]}>
              {renderCard(item)}
            </Animated.View>
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { position: 'absolute', width: SCREEN_WIDTH * 0.9, height: '75%' },
});
