import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Clipboard from 'expo-clipboard';
import { Linking, Platform } from 'react-native';

export const SUPPORT_EMAIL = 'swipix@bosetti.dev';

export function getAppVersion(): string {
  return Constants.expoConfig?.version ?? 'unknown';
}

/**
 * The native build number (iOS CFBundleVersion / Android versionCode) of the
 * actually-installed binary. Unlike the marketing version, this increments on
 * every store build — so it's what distinguishes two releases that share a
 * version name (every Android release does, since only the versionCode is
 * bumped there). Read from the native binary via expo-application, not
 * app.json, because this project uses EAS remote versioning (the build number
 * lives on EAS servers, never in app.json).
 */
export function getBuildNumber(): string {
  return Application.nativeBuildVersion ?? 'unknown';
}

export function getDeviceDescription(): string {
  return Device.modelName ?? Platform.OS;
}

export function getOsDescription(): string {
  const osName = Device.osName ?? (Platform.OS === 'ios' ? 'iOS' : 'Android');
  const osVersion = Device.osVersion ?? String(Platform.Version);
  return `${osName} ${osVersion}`;
}

export function buildFeedbackMailtoUrl(subject: string, body: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Returns whether the mail app actually opened — some devices (and the
 * iOS Simulator, when no Mail account is configured) have no handler for
 * mailto: at all, in which case Linking.openURL rejects. The caller uses
 * this to fall back to something the user can still act on (the address
 * itself), instead of the tap silently doing nothing.
 */
export async function openFeedbackEmail(subject: string, body: string): Promise<boolean> {
  try {
    await Linking.openURL(buildFeedbackMailtoUrl(subject, body));
    return true;
  } catch {
    return false;
  }
}

export async function copySupportEmailToClipboard(): Promise<void> {
  await Clipboard.setStringAsync(SUPPORT_EMAIL);
}
