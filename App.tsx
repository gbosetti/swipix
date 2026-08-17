import 'react-native-gesture-handler';
import React, { useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RootNavigator from './src/navigation/RootNavigator';
import OnboardingScreen from './src/screens/OnboardingScreen';
import ErrorBoundary from './src/components/ErrorBoundary';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { initI18n } from './src/i18n';

/**
 * Crash/error reporting only — deliberately not the full Sentry feature
 * set. No session replay (would record the exact photos on screen), no
 * screenshot attachment on error (same reason), no default PII (IP
 * address, etc.). Swipix's whole premise is that photos never leave the
 * device; a crash reporter is the one exception that must stay strictly
 * scoped to "what code path crashed," not "what was the user looking at."
 *
 * @remarks
 * Runs before React even starts rendering, so a throw here would be
 * outside ErrorBoundary's reach entirely — the one component whose job
 * is "the app must never fail to start" wouldn't get a chance to run.
 * Wrapped defensively so a crash reporter misconfiguration can never
 * itself be the reason the app won't launch.
 */
try {
  Sentry.init({
    dsn: 'https://e7513a3c777f8c6aad72e987585d8532@o4511928343003136.ingest.de.sentry.io/4511928364564560',
    sendDefaultPii: false,
    attachScreenshot: false,
    tracesSampleRate: 0,
    environment: __DEV__ ? 'development' : 'production',
    debug: __DEV__,
  });
} catch (error) {
  // Always logged, not just in __DEV__ — Sentry itself is unavailable to
  // report this one, so the OS's own system log (visible via Console.app
  // or on-device diagnostics, same as any other crash log) is the only
  // remaining trail if this ever happens in production.
  console.warn('Sentry.init failed, continuing without crash reporting:', error);
}

export const CONSENT_KEY = '@swipix/consent';

/**
 * Bump this whenever TERMS.md or PRIVACY.md changes in a way that
 * affects what the user agreed to. A version bump makes any previously
 * stored consent stale, so onboarding (and re-acceptance) is shown
 * again — consent is tied to a specific, provable version and
 * timestamp, not just "the user tapped Accept at some point." Keep in
 * sync with both docs' "Last updated" dates.
 */
export const CONSENT_VERSION = '2026-08-18-1';

interface Consent {
  version: string;
  acceptedAt: number;
}

/**
 * A step that never resolves (a hung native module call, for example)
 * used to leave the app stuck on the splash screen forever, with zero
 * feedback — confirmed on a real Android device. Racing every startup
 * step against this bounds the worst case: the app always becomes
 * usable within STARTUP_TIMEOUT_MS, falling back to onboarding, same as
 * any other startup failure.
 */
const STARTUP_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Startup step timed out after ${STARTUP_TIMEOUT_MS}ms: ${label}`)),
      STARTUP_TIMEOUT_MS
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Keeps the native (black) splash on screen until the onboarding check
 * below resolves — without this, Expo hides the splash as soon as the JS
 * bridge comes up, exposing the OS's default white root view for a beat
 * before this component even renders its own black loading view.
 */
SplashScreen.preventAutoHideAsync().catch(() => {});

function App() {
  return (
    <GestureHandlerRootView style={rootStyles.root}>
      <ErrorBoundary>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(App);

const rootStyles = StyleSheet.create({ root: { flex: 1 } });

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
    (async () => {
      try {
        await withTimeout(initI18n(), 'initI18n');
        const raw = await withTimeout(AsyncStorage.getItem(CONSENT_KEY), 'AsyncStorage.getItem');
        const consent: Consent | null = raw ? JSON.parse(raw) : null;
        setHasCurrentConsent(consent?.version === CONSENT_VERSION);
      } catch (error) {
        /**
         * Without this catch, a rejected initI18n() (or a malformed
         * stored consent value) would leave hasCurrentConsent stuck at
         * null forever — the loading spinner below never resolves, and
         * the splash screen call further down never runs. Falling back
         * to "no consent on record" is safe either way: worst case, the
         * user sees onboarding again, not a silently broken app.
         */
        if (__DEV__) console.warn('App startup init failed, falling back to onboarding:', error);
        setHasCurrentConsent(false);
      } finally {
        SplashScreen.hideAsync().catch(() => {});
      }
    })();
  }, []);

  const completeOnboarding = async () => {
    const consent: Consent = { version: CONSENT_VERSION, acceptedAt: Date.now() };
    try {
      await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
    } catch (error) {
      /**
       * Proceed regardless — a failed write just means onboarding shows
       * again next launch, not that the user gets stuck here now.
       */
      if (__DEV__) console.warn('Failed to persist onboarding consent:', error);
    }
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
