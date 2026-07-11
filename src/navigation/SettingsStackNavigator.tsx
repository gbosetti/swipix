import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import SettingsScreen from '../screens/SettingsScreen';
import TermsScreen from '../screens/TermsScreen';
import LanguageScreen from '../screens/LanguageScreen';
import { SettingsStackParamList } from './types';
import { Colors } from '../theme/colors';

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export default function SettingsStackNavigator() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          headerShown: true,
          headerTitle: t('nav.settings'),
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: 'white',
        }}
      />
      <Stack.Screen
        name="Terms"
        component={TermsScreen}
        options={{
          headerShown: true,
          headerTitle: t('nav.terms'),
          headerBackTitle: t('nav.back'),
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: 'white',
        }}
      />
      <Stack.Screen
        name="Language"
        component={LanguageScreen}
        options={{
          headerShown: true,
          headerTitle: t('language.title'),
          headerBackTitle: t('nav.back'),
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: 'white',
        }}
      />
    </Stack.Navigator>
  );
}
