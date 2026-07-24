import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App, { CONSENT_KEY, CONSENT_VERSION } from './App';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn().mockResolvedValue(undefined),
  hideAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./src/i18n', () => ({ initI18n: jest.fn().mockResolvedValue(undefined) }));

// The real RootNavigator/OnboardingScreen pull in navigation, media
// library, ads, and every screen in the app — far more than this test
// needs. Standing in a marker for each lets these tests verify App.tsx's
// own job (deciding WHICH one to show, from stored consent) without
// depending on any of that.
jest.mock('./src/navigation/RootNavigator', () => {
  // jest.mock factories can't reference out-of-scope imports (they're
  // hoisted above them) — require() inside the factory is the standard
  // workaround, not a stray import left in by mistake.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text: MockText } = require('react-native');
  return function MockRootNavigator() {
    return <MockText>MAIN_APP</MockText>;
  };
});
jest.mock('./src/screens/OnboardingScreen', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text: MockText, Pressable: MockPressable } = require('react-native');
  return function MockOnboardingScreen({ onAccept }: { onAccept: () => void }) {
    return (
      <MockPressable onPress={onAccept}>
        <MockText>ONBOARDING</MockText>
      </MockPressable>
    );
  };
});

describe('App consent versioning', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('shows onboarding when no consent has ever been stored', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('ONBOARDING')).toBeTruthy());
  });

  it('shows the main app when stored consent matches the current version', async () => {
    await AsyncStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ version: CONSENT_VERSION, acceptedAt: Date.now() })
    );

    render(<App />);

    await waitFor(() => expect(screen.getByText('MAIN_APP')).toBeTruthy());
  });

  it('shows onboarding again when stored consent is for an older version', async () => {
    await AsyncStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ version: '2020-01-01-0', acceptedAt: Date.now() })
    );

    render(<App />);

    await waitFor(() => expect(screen.getByText('ONBOARDING')).toBeTruthy());
  });

  it('accepting onboarding persists current-version consent and switches to the main app', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('ONBOARDING')).toBeTruthy());

    fireEvent.press(screen.getByText('ONBOARDING'));

    await waitFor(() => expect(screen.getByText('MAIN_APP')).toBeTruthy());

    const stored = await AsyncStorage.getItem(CONSENT_KEY);
    expect(JSON.parse(stored as string).version).toBe(CONSENT_VERSION);
  });
});
