import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SettingsScreen from '../screens/SettingsScreen';
import TermsScreen from '../screens/TermsScreen';
import { SettingsStackParamList } from './types';
import { Colors } from '../theme/colors';

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
          headerStyle: { backgroundColor: Colors.background },
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
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: 'white',
        }}
      />
    </Stack.Navigator>
  );
}
