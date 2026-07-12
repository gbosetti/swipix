import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';

/**
 * The terms text itself, shared between the onboarding modal and the
 * standalone Terms screen reachable from Settings — one source of truth
 * so the two never drift out of sync. Full legal text lives in TERMS.md.
 *
 * Translated like the rest of the UI, but note: these paragraphs are
 * plain-language translations, not legal review — if the wording needs
 * to hold up in a specific jurisdiction, have a native-speaking legal
 * reviewer check the es/it/fr copy in src/i18n/locales before shipping.
 */
export default function TermsContent() {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <>
      <Text style={styles.paragraph}>{t('terms.p1')}</Text>
      <Text style={styles.paragraph}>{t('terms.p2')}</Text>
      <Text style={styles.paragraph}>{t('terms.p3')}</Text>
      <Text style={styles.paragraph}>{t('terms.p4')}</Text>
      <Text style={styles.paragraph}>{t('terms.p5')}</Text>
      <Text style={styles.paragraph}>{t('terms.p6')}</Text>
      <Text style={styles.paragraph}>{t('terms.p7')}</Text>
    </>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    paragraph: { color: colors.textTertiary, fontSize: 15, lineHeight: 22, marginBottom: 16 },
  });
}
