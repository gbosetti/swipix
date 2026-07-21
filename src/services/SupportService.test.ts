import {
  getAppVersion,
  getDeviceDescription,
  getOsDescription,
  buildFeedbackMailtoUrl,
  openFeedbackEmail,
  copySupportEmailToClipboard,
} from './SupportService';
import { Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0' } },
}));
jest.mock('expo-device', () => ({
  modelName: 'iPhone 15',
  osName: 'iOS',
  osVersion: '18.1',
}));
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('react-native', () => ({
  Linking: { openURL: jest.fn().mockResolvedValue(undefined) },
  Platform: { OS: 'ios', Version: '18.1' },
}));

describe('SupportService', () => {
  it('reads the app version from the Expo config', () => {
    expect(getAppVersion()).toBe('1.0.0');
  });

  it('reads the device model', () => {
    expect(getDeviceDescription()).toBe('iPhone 15');
  });

  it('combines OS name and version', () => {
    expect(getOsDescription()).toBe('iOS 18.1');
  });

  it('builds a mailto URL to the support address with an encoded subject and body', () => {
    const url = buildFeedbackMailtoUrl('Swipix feedback', 'line one\nline two');
    expect(url).toBe(
      'mailto:swipix@bosetti.dev?subject=Swipix%20feedback&body=line%20one%0Aline%20two'
    );
  });

  it('opens the mailto URL via Linking and reports success', async () => {
    await expect(openFeedbackEmail('subject', 'body')).resolves.toBe(true);
    expect(Linking.openURL).toHaveBeenCalledWith('mailto:swipix@bosetti.dev?subject=subject&body=body');
  });

  it('reports failure instead of throwing when no app can handle mailto: (regression: a device with no mail client must not crash the tap)', async () => {
    (Linking.openURL as jest.Mock).mockRejectedValueOnce(new Error('Unable to open URL'));
    await expect(openFeedbackEmail('subject', 'body')).resolves.toBe(false);
  });

  it('copies the support email address to the clipboard', async () => {
    await copySupportEmailToClipboard();
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('swipix@bosetti.dev');
  });
});
