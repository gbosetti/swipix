import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import KeptScreen from '../screens/KeptScreen';
import { KeptStackParamList } from './types';
import { useColors } from '../theme/ThemeContext';

const Stack = createNativeStackNavigator<KeptStackParamList>();

export default function KeptStackNavigator() {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="Kept"
        component={KeptScreen}
        options={{
          headerShown: true,
          headerTitle: t('nav.kept'),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
        }}
      />
    </Stack.Navigator>
  );
}
