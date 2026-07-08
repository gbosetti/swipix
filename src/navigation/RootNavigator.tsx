import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CategoryPickerScreen from '../screens/CategoryPickerScreen';
import SwipeScreen from '../screens/SwipeScreen';
import TrashScreen from '../screens/TrashScreen';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
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
        <Stack.Screen
          name="Trash"
          component={TrashScreen}
          options={{
            headerShown: true,
            headerTitle: 'Trash',
            headerBackTitle: 'Back',
            headerStyle: { backgroundColor: '#000' },
            headerTintColor: 'white',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
