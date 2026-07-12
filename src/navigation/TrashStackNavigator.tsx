import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import TrashScreen from '../screens/TrashScreen';
import { TrashStackParamList } from './types';
import { useColors } from '../theme/ThemeContext';

const Stack = createNativeStackNavigator<TrashStackParamList>();

export default function TrashStackNavigator() {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="Trash"
        component={TrashScreen}
        options={{
          headerShown: true,
          headerTitle: t('nav.trash'),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
        }}
      />
    </Stack.Navigator>
  );
}
