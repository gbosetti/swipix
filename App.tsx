import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RootNavigator from './src/navigation/RootNavigator';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { Colors } from './src/theme/colors';
import { initI18n } from './src/i18n';

const ONBOARDING_COMPLETE_KEY = '@swipix/onboardingComplete';

// Keeps the native (black) splash on screen until the onboarding check
// below resolves — without this, Expo hides the splash as soon as the JS
// bridge comes up, exposing the OS's default white root view for a beat
// before this component even renders its own black loading view.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  useEffect(() => {
    Promise.all([
      initI18n(),
      AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY).then((value) => setOnboardingComplete(value === 'true')),
    ]).then(() => {
      SplashScreen.hideAsync().catch(() => {});
    });
  }, []);

  const completeOnboarding = () => {
    AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    setOnboardingComplete(true);
  };

  if (onboardingComplete === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      {onboardingComplete ? (
        <RootNavigator />
      ) : (
        <OnboardingScreen onAccept={completeOnboarding} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
});
