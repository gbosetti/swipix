import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';

/**
 * The terms text, shared between the onboarding modal and the standalone
 * Terms screen — one source of truth. Full text lives in TERMS.md.
 *
 * @remarks
 * Deliberately English-only, same reasoning as PrivacyContent.
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
