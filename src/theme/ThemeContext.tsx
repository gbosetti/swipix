import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkColors, LightColors, ColorPalette } from './colors';

export type ThemeMode = 'system' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';

const THEME_MODE_KEY = '@swipix/themeMode';
const DEFAULT_MODE: ThemeMode = 'system';

interface ThemeContextValue {
  mode: ThemeMode;
  scheme: Scheme;
  colors: ColorPalette;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeMode(value: string): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * Resolves mode + the device's own appearance into one concrete scheme.
 * A manual "light"/"dark" choice always wins; "system" falls through to
 * whatever the OS reports (defaulting dark if that's ever unavailable,
 * matching how this app has always looked until now).
 */
function resolveScheme(mode: ThemeMode, deviceScheme: Scheme | null | undefined): Scheme {
  if (mode !== 'system') {
    return mode;
  }
  return deviceScheme ?? 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const deviceScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_MODE);

  useEffect(() => {
    AsyncStorage.getItem(THEME_MODE_KEY).then((stored) => {
      if (stored && isThemeMode(stored)) {
        setModeState(stored);
      }
    });
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    /**
     * Applied to the UI regardless of whether this write succeeds — a
     * failed write just means the choice doesn't survive a restart, not
     * that switching the theme right now should be blocked or reverted.
     */
    AsyncStorage.setItem(THEME_MODE_KEY, next).catch((error) => {
      if (__DEV__) {
        console.warn('Failed to persist theme mode:', error);
      }
    });
  };

  const scheme = resolveScheme(mode, deviceScheme);
  const colors = scheme === 'light' ? LightColors : DarkColors;

  const value = useMemo(() => ({ mode, scheme, colors, setMode }), [mode, scheme, colors]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

/**
 * Shorthand for the common case — most components only need the
 * active palette, not the mode-switching machinery.
 */
export function useColors(): ColorPalette {
  return useTheme().colors;
}
