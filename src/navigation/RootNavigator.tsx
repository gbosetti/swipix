import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import CategoriesStackNavigator from './CategoriesStackNavigator';
import SwipeTabNavigator from './SwipeTabNavigator';
import TrashStackNavigator from './TrashStackNavigator';
import SettingsStackNavigator from './SettingsStackNavigator';
import { RootTabParamList } from './types';
import { useTheme } from '../theme/ThemeContext';

const Tab = createBottomTabNavigator<RootTabParamList>();

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<keyof RootTabParamList, { focused: IoniconName; unfocused: IoniconName }> = {
  CategoriesTab: { focused: 'pencil', unfocused: 'pencil-outline' },
  SwipeTab: { focused: 'swap-horizontal', unfocused: 'swap-horizontal-outline' },
  TrashTab: { focused: 'trash', unfocused: 'trash-outline' },
  SettingsTab: { focused: 'settings', unfocused: 'settings-outline' },
};

export default function RootNavigator() {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const navTheme = {
    ...(scheme === 'light' ? DefaultTheme : DarkTheme),
    colors: {
      ...(scheme === 'light' ? DefaultTheme.colors : DarkTheme.colors),
      background: colors.background,
      card: colors.card,
      text: colors.textPrimary,
      border: colors.card,
      primary: colors.accent,
    },
  };
  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.card },
          tabBarIcon: ({ color, size, focused }) => {
            const icon = ICONS[route.name];
            return (
              <Ionicons
                name={focused ? icon.focused : icon.unfocused}
                size={size}
                color={color}
              />
            );
          },
        })}
      >
        <Tab.Screen
          name="CategoriesTab"
          component={CategoriesStackNavigator}
          options={{ title: t('tabs.categories') }}
        />
        <Tab.Screen
          name="SwipeTab"
          component={SwipeTabNavigator}
          options={{ title: t('tabs.swipe') }}
        />
        <Tab.Screen
          name="TrashTab"
          component={TrashStackNavigator}
          options={{ title: t('tabs.trash') }}
        />
        <Tab.Screen
          name="SettingsTab"
          component={SettingsStackNavigator}
          options={{ title: t('tabs.settings') }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
