import React from 'react';
import { Text, useColorScheme } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from './ThemeContext';

/**
 * Mocking the specific internal module useColorScheme comes from, rather
 * than the whole react-native package — re-requiring the entire package
 * inside a jest.mock factory (e.g. via requireActual + spread) drags in
 * native-only modules (DevMenu, etc.) that aren't available under
 * jest-expo's mocked environment and blow up the whole test file.
 * react-native's own index.js reads `.default` off this module (it's a
 * TS default export), so the mock has to shape up the same way.
 */
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockedUseColorScheme = useColorScheme as jest.Mock;

function SchemeProbe() {
  const { scheme } = useTheme();
  return <Text>scheme:{scheme}</Text>;
}

describe('ThemeProvider scheme resolution', () => {
  beforeEach(() => jest.clearAllMocks());

  it('defaults to dark when in system mode and the OS reports no preference', async () => {
    mockedUseColorScheme.mockReturnValue(null);
    render(
      <ThemeProvider>
        <SchemeProbe />
      </ThemeProvider>
    );
    await waitFor(() => expect(screen.getByText('scheme:dark')).toBeTruthy());
  });

  it('follows the OS scheme when in system mode and the OS reports light', async () => {
    mockedUseColorScheme.mockReturnValue('light');
    render(
      <ThemeProvider>
        <SchemeProbe />
      </ThemeProvider>
    );
    await waitFor(() => expect(screen.getByText('scheme:light')).toBeTruthy());
  });

  it('follows the OS scheme when in system mode and the OS reports dark', async () => {
    mockedUseColorScheme.mockReturnValue('dark');
    render(
      <ThemeProvider>
        <SchemeProbe />
      </ThemeProvider>
    );
    await waitFor(() => expect(screen.getByText('scheme:dark')).toBeTruthy());
  });
});
