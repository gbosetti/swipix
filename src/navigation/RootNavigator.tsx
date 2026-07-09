import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import CategoriesStackNavigator from './CategoriesStackNavigator';
import SwipeTabNavigator from './SwipeTabNavigator';
import TrashStackNavigator from './TrashStackNavigator';
import SettingsStackNavigator from './SettingsStackNavigator';
import { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<keyof RootTabParamList, { focused: IoniconName; unfocused: IoniconName }> = {
  CategoriesTab: { focused: 'pencil', unfocused: 'pencil-outline' },
  SwipeTab: { focused: 'swap-horizontal', unfocused: 'swap-horizontal-outline' },
  TrashTab: { focused: 'trash', unfocused: 'trash-outline' },
  SettingsTab: { focused: 'settings', unfocused: 'settings-outline' },
};

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: '#0a84ff',
          tabBarInactiveTintColor: '#8e8e93',
          tabBarStyle: { backgroundColor: '#000', borderTopColor: '#1c1c1e' },
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
          options={{ title: 'Categories' }}
        />
        <Tab.Screen name="SwipeTab" component={SwipeTabNavigator} options={{ title: 'Swipe' }} />
        <Tab.Screen name="TrashTab" component={TrashStackNavigator} options={{ title: 'Trash' }} />
        <Tab.Screen
          name="SettingsTab"
          component={SettingsStackNavigator}
          options={{ title: 'Settings' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
