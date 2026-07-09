import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SettingsScreen from '../screens/SettingsScreen';
import TermsScreen from '../screens/TermsScreen';
import { SettingsStackParamList } from './types';

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export default function SettingsStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          headerShown: true,
          headerTitle: 'Settings',
          headerStyle: { backgroundColor: '#000' },
          headerTintColor: 'white',
        }}
      />
      <Stack.Screen
        name="Terms"
        component={TermsScreen}
        options={{
          headerShown: true,
          headerTitle: 'Terms of Use',
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: '#000' },
          headerTintColor: 'white',
        }}
      />
    </Stack.Navigator>
  );
}
