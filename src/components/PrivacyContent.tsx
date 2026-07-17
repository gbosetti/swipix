import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';

/**
 * The privacy summary, shared between the standalone Privacy screen
 * reachable from Settings and (should a future onboarding step need it)
 * anywhere else — one source of truth so copies never drift. Full text
 * lives in PRIVACY.md.
 *
 * Deliberately English-only: the `privacy.*` keys exist only in en.json,
 * so i18next's fallbackLng renders this in English regardless of the
 * active app language. Legal text is high-stakes to get precisely right
 * and hard to verify in a language the team can't proofread, so it isn't
 * translated — unlike the surrounding UI chrome (nav labels, buttons),
 * which is.
 */
export default function PrivacyContent() {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <>
      <Text style={styles.paragraph}>{t('privacy.p1')}</Text>
      <Text style={styles.paragraph}>{t('privacy.p2')}</Text>
      <Text style={styles.paragraph}>{t('privacy.p3')}</Text>
      <Text style={styles.paragraph}>{t('privacy.p4')}</Text>
      <Text style={styles.paragraph}>{t('privacy.p5')}</Text>
      <Text style={styles.paragraph}>{t('privacy.p6')}</Text>
      <Text style={styles.paragraph}>{t('privacy.p7')}</Text>
    </>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    paragraph: { color: colors.textTertiary, fontSize: 15, lineHeight: 22, marginBottom: 16 },
  });
}
