import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import CategoriesStackNavigator from './CategoriesStackNavigator';
import SwipeTabNavigator from './SwipeTabNavigator';
import TrashStackNavigator from './TrashStackNavigator';
import KeptStackNavigator from './KeptStackNavigator';
import SettingsStackNavigator from './SettingsStackNavigator';
import { RootTabParamList } from './types';
import { useTheme } from '../theme/ThemeContext';
import { BulkOperationProvider, useBulkOperation } from './BulkOperationContext';

const Tab = createBottomTabNavigator<RootTabParamList>();

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<keyof RootTabParamList, { focused: IoniconName; unfocused: IoniconName }> = {
  CategoriesTab: { focused: 'pencil', unfocused: 'pencil-outline' },
  SwipeTab: { focused: 'swap-horizontal', unfocused: 'swap-horizontal-outline' },
  TrashTab: { focused: 'trash', unfocused: 'trash-outline' },
  KeptTab: { focused: 'checkmark-circle', unfocused: 'checkmark-circle-outline' },
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
      <BulkOperationProvider>
        <Tabs colors={colors} t={t} />
      </BulkOperationProvider>
    </NavigationContainer>
  );
}

/**
 * Split out from RootNavigator so it can read BulkOperationContext — the
 * provider has to sit above this, not around it.
 */
function Tabs({
  colors,
  t,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const { isBulkDeleteInProgress } = useBulkOperation();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.card },
        tabBarIcon: ({ color, size, focused }) => {
          const icon = ICONS[route.name];
          return <Ionicons name={focused ? icon.focused : icon.unfocused} size={size} color={color} />;
        },
      })}
      /**
       * Blocks switching tabs during a bulk trash deletion (see
       * BulkOperationContext) — every tab stays mounted, so a native
       * delete dialog could otherwise surface on an unrelated screen.
       */
      screenListeners={{
        tabPress: (e) => {
          if (isBulkDeleteInProgress) {
            e.preventDefault();
          }
        },
      }}
    >
      <Tab.Screen
        name="CategoriesTab"
        component={CategoriesStackNavigator}
        /**
         * Reset the nested stack to the category list whenever this tab
         * loses focus, so returning to it never drops the user back into a
         * half-finished swipe session left open on another tab.
         */
        options={{ title: t('tabs.categories'), popToTopOnBlur: true }}
      />
      <Tab.Screen name="SwipeTab" component={SwipeTabNavigator} options={{ title: t('tabs.swipe') }} />
      <Tab.Screen name="TrashTab" component={TrashStackNavigator} options={{ title: t('tabs.trash') }} />
      <Tab.Screen name="KeptTab" component={KeptStackNavigator} options={{ title: t('tabs.kept') }} />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsStackNavigator}
        options={{ title: t('tabs.settings') }}
      />
    </Tab.Navigator>
  );
}
