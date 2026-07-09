import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SwipeScreen from '../screens/SwipeScreen';
import { RandomPhotosStrategy } from '../strategies/RandomPhotosStrategy';
import { SwipeTabStackParamList } from './types';

const Stack = createNativeStackNavigator<SwipeTabStackParamList>();
const randomPhotosStrategy = new RandomPhotosStrategy();

/**
 * A single-screen stack so SwipeScreen still gets native-stack header
 * behavior (transparent header, safe-area-aware content offset) even
 * though this is a tab root with nothing to go back to. Native-stack
 * automatically omits the back button when there's no previous screen.
 */
export default function SwipeTabNavigator() {
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
          headerTintColor: 'white',
        }}
      />
    </Stack.Navigator>
  );
}
