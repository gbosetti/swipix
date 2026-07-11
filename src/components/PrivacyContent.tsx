import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../theme/colors';

/**
 * The privacy summary, shared between the standalone Privacy screen
 * reachable from Settings and (should a future onboarding step need it)
 * anywhere else — one source of truth so copies never drift. Full text
 * lives in PRIVACY.md.
 *
 * Translated like the rest of the UI, but note: these paragraphs are
 * plain-language translations, not legal review — if the wording needs
 * to hold up in a specific jurisdiction, have a native-speaking legal
 * reviewer check the es/it/fr copy in src/i18n/locales before shipping.
 */
export default function PrivacyContent() {
  const { t } = useTranslation();
  return (
    <>
      <Text style={styles.paragraph}>{t('privacy.p1')}</Text>
      <Text style={styles.paragraph}>{t('privacy.p2')}</Text>
      <Text style={styles.paragraph}>{t('privacy.p3')}</Text>
      <Text style={styles.paragraph}>{t('privacy.p4')}</Text>
      <Text style={styles.paragraph}>{t('privacy.p5')}</Text>
      <Text style={styles.paragraph}>{t('privacy.p6')}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  paragraph: { color: Colors.textTertiary, fontSize: 15, lineHeight: 22, marginBottom: 16 },
});
