import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CategoryPickerScreen from '../screens/CategoryPickerScreen';
import SwipeScreen from '../screens/SwipeScreen';
import TrashScreen from '../screens/TrashScreen';
import SettingsScreen from '../screens/SettingsScreen';
import TermsScreen from '../screens/TermsScreen';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="CategoryPicker"
          component={CategoryPickerScreen}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Swipix',
            headerStyle: { backgroundColor: '#000' },
            headerTintColor: 'white',
            headerShadowVisible: false,
            headerRight: () => (
              <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={8}>
                <Text style={styles.gearIcon}>⚙️</Text>
              </Pressable>
            ),
          })}
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
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            headerShown: true,
            headerTitle: 'Settings',
            headerBackTitle: 'Back',
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
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  gearIcon: { fontSize: 20 },
});
