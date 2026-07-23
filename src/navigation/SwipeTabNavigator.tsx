import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SwipeScreen from '../screens/SwipeScreen';
import { RandomPhotosStrategy } from '../strategies/RandomPhotosStrategy';
import { SwipeTabStackParamList } from './types';
import { useColors } from '../theme/ThemeContext';

const Stack = createNativeStackNavigator<SwipeTabStackParamList>();
// Note: SwipeScreen now loads photos page by page rather than all at once
// (see its PAGE_SIZE/fetchMoreMatches), so RandomPhotosStrategy's shuffle
// happens within each fetched page rather than across the whole library —
// accepted tradeoff for a Swipe screen that opens instantly even with
// thousands of photos, instead of shuffling everything up front.
const randomPhotosStrategy = new RandomPhotosStrategy();

/**
 * A single-screen stack so SwipeScreen still gets native-stack header
 * behavior (transparent header, safe-area-aware content offset) even
 * though this is a tab root with nothing to go back to. Native-stack
 * automatically omits the back button when there's no previous screen.
 */
export default function SwipeTabNavigator() {
  const colors = useColors();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="Swipe"
        component={SwipeScreen}
        initialParams={{ strategy: randomPhotosStrategy }}
        options={{
          headerShown: true,
          headerTitle: '',
          headerTransparent: true,
          headerTintColor: colors.textPrimary,
        }}
      />
    </Stack.Navigator>
  );
}
