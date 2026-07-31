import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './locales/en.json';
import es from './locales/es.json';
import it from './locales/it.json';
import fr from './locales/fr.json';

export const SUPPORTED_LANGUAGES = ['en', 'es', 'it', 'fr'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

const LANGUAGE_STORAGE_KEY = '@swipix/language';

const resources = {
  en: { translation: en },
  es: { translation: es },
  it: { translation: it },
  fr: { translation: fr },
};

function isSupportedLanguage(tag: string): tag is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(tag);
}

/**
 * First device locale (in preference order) that we actually ship a
 * translation for, or the fallback if none match.
 */
function detectDeviceLanguage(): SupportedLanguage {
  const match = Localization.getLocales().find((locale) =>
    isSupportedLanguage(locale.languageCode ?? '')
  );
  return (match?.languageCode as SupportedLanguage | undefined) ?? FALLBACK_LANGUAGE;
}

/**
 * Resolves the language to boot with: an explicit choice the user made
 * earlier (persisted in Settings) wins over the device's own locale, so
 * a manual override survives across app restarts instead of being
 * re-guessed from the OS every time.
 */
async function resolveInitialLanguage(): Promise<SupportedLanguage> {
  const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored && isSupportedLanguage(stored)) {
    return stored;
  }
  return detectDeviceLanguage();
}

export async function initI18n(): Promise<void> {
  const language = await resolveInitialLanguage();
  await i18next.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: FALLBACK_LANGUAGE,
    interpolation: { escapeValue: false },
  });
}

/**
 * Changes the active language immediately (no restart needed) and
 * persists the choice so it's used again on next launch.
 */
export async function setLanguage(language: SupportedLanguage): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  await i18next.changeLanguage(language);
}

export default i18next;
