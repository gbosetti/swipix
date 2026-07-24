import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SwipeScreen from '../screens/SwipeScreen';
import { SwipeTabStackParamList } from './types';
import { useColors } from '../theme/ThemeContext';

const Stack = createNativeStackNavigator<SwipeTabStackParamList>();

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
        // SwipeScreen reconstructs the real strategy from this id (see
        // strategyRegistry.ts) — it loads photos page by page rather than
        // all at once, so RandomPhotosStrategy's shuffle happens within
        // each fetched page rather than across the whole library, an
        // accepted tradeoff for a Swipe screen that opens instantly even
        // with thousands of photos.
        initialParams={{ strategyId: 'random' }}
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
