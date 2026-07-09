import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CategoryPickerScreen from '../screens/CategoryPickerScreen';
import SwipeScreen from '../screens/SwipeScreen';
import { CategoriesStackParamList } from './types';

const Stack = createNativeStackNavigator<CategoriesStackParamList>();

export default function CategoriesStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="CategoryPicker"
        component={CategoryPickerScreen}
        options={{
          headerShown: true,
          headerTitle: 'Swipix',
          headerStyle: { backgroundColor: '#000' },
          headerTintColor: 'white',
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="Swipe"
        component={SwipeScreen}
        options={{
          headerShown: true,
          headerTitle: '',
          headerBackTitle: 'Back',
          headerTransparent: true,
          headerTintColor: 'white',
        }}
      />
    </Stack.Navigator>
  );
}
