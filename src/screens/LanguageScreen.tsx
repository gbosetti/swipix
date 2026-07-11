import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { SUPPORTED_LANGUAGES, setLanguage, SupportedLanguage } from '../i18n';
import { Colors } from '../theme/colors';

/**
 * Runtime language switch, reachable from Settings. Changing the
 * selection here calls i18next.changeLanguage immediately (every screen
 * re-renders in the new language without an app restart) and persists
 * the choice, so it's the language used again on next launch too —
 * overriding the device-locale guess made on first install.
 */
export default function LanguageScreen() {
  const { t, i18n } = useTranslation();

  return (
    <View style={styles.screen}>
      {SUPPORTED_LANGUAGES.map((code: SupportedLanguage) => {
        const selected = i18n.language === code;
        return (
          <Pressable key={code} style={styles.row} onPress={() => setLanguage(code)}>
            <Text style={styles.rowText}>{t(`language.${code}`)}</Text>
            {selected && <Ionicons name="checkmark" size={20} color={Colors.accent} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background, padding: 20, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  rowText: { color: Colors.textPrimary, fontSize: 16 },
});
