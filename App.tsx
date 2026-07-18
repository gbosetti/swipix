import React, { useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RootNavigator from './src/navigation/RootNavigator';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { initI18n } from './src/i18n';

const CONSENT_KEY = '@swipix/consent';

// Bump this whenever TERMS.md or PRIVACY.md changes in a way that
// affects what the user agreed to. A version bump makes any previously
// stored consent stale, so onboarding (and re-acceptance) is shown
// again — consent is tied to a specific, provable version and
// timestamp, not just "the user tapped Accept at some point." Keep in
// sync with both docs' "Last updated" dates.
const CONSENT_VERSION = '2026-07-18-2';

interface Consent {
  version: string;
  acceptedAt: number;
}

// Keeps the native (black) splash on screen until the onboarding check
// below resolves — without this, Expo hides the splash as soon as the JS
// bridge comes up, exposing the OS's default white root view for a beat
// before this component even renders its own black loading view.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const { colors, scheme } = useTheme();
  const [hasCurrentConsent, setHasCurrentConsent] = useState<boolean | null>(null);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
      }),
    [colors]
  );

  useEffect(() => {
    Promise.all([
      initI18n(),
      AsyncStorage.getItem(CONSENT_KEY).then((raw) => {
        const consent: Consent | null = raw ? JSON.parse(raw) : null;
        setHasCurrentConsent(consent?.version === CONSENT_VERSION);
      }),
    ]).then(() => {
      SplashScreen.hideAsync().catch(() => {});
    });
  }, []);

  const completeOnboarding = () => {
    const consent: Consent = { version: CONSENT_VERSION, acceptedAt: Date.now() };
    AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
    setHasCurrentConsent(true);
  };

  if (hasCurrentConsent === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
      {hasCurrentConsent ? (
        <RootNavigator />
      ) : (
        <OnboardingScreen onAccept={completeOnboarding} />
      )}
    </>
  );
}
