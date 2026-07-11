import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import CategoryPickerScreen from '../screens/CategoryPickerScreen';
import SwipeScreen from '../screens/SwipeScreen';
import { CategoriesStackParamList } from './types';
import { Colors } from '../theme/colors';

const Stack = createNativeStackNavigator<CategoriesStackParamList>();

export default function CategoriesStackNavigator() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="CategoryPicker"
        component={CategoryPickerScreen}
        options={{
          headerShown: true,
          headerTitle: t('nav.swipix'),
          headerStyle: { backgroundColor: Colors.background },
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
          headerBackTitle: t('nav.back'),
          headerTransparent: true,
          headerTintColor: 'white',
        }}
      />
    </Stack.Navigator>
  );
}
