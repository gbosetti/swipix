import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, DevSettings, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SettingsStackParamList } from '../navigation/types';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';
import {
  SUPPORT_EMAIL,
  getAppVersion,
  getBuildNumber,
  getDeviceDescription,
  getOsDescription,
  openFeedbackEmail,
  copySupportEmailToClipboard,
} from '../services/SupportService';
import { requestAppReview } from '../services/RatingService';
import { PhotoLibraryService } from '../services/PhotoLibraryService';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleReportPress = async () => {
    const version = getAppVersion();
    const subject = t('settings.reportEmailSubject', { version });
    const body = t('settings.reportEmailBody', {
      version,
      device: getDeviceDescription(),
      os: getOsDescription(),
    });
    const opened = await openFeedbackEmail(subject, body);
    if (!opened) {
      Alert.alert(
        t('settings.reportFailedTitle'),
        t('settings.reportFailedBody', { email: SUPPORT_EMAIL }),
        [
          { text: t('settings.copyEmailAction'), onPress: () => copySupportEmailToClipboard() },
          { text: t('settings.dismissAction'), style: 'cancel' },
        ]
      );
    }
  };

  const handleManageAccessPress = async () => {
    const opened = await PhotoLibraryService.manageLibraryAccess();
    if (!opened) {
      Alert.alert(t('settings.manageAccessFailedTitle'), t('settings.manageAccessFailedBody'));
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.versionText}>
        {t('settings.versionLabel', { version: getAppVersion(), build: getBuildNumber() })}
      </Text>
      <Text style={styles.sectionHeader}>{t('settings.preferencesSection')}</Text>
      <Pressable style={styles.row} onPress={() => navigation.navigate('Appearance')}>
        <Text style={styles.rowText}>{t('settings.appearanceRow')}</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => navigation.navigate('Language')}>
        <Text style={styles.rowText}>{t('settings.languageRow')}</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={handleManageAccessPress}>
        <Text style={styles.rowText}>{t('settings.manageAccessRow')}</Text>
        <Ionicons name="images-outline" size={18} color={colors.textSecondary} />
      </Pressable>

      <Text style={styles.sectionHeader}>{t('settings.supportSection')}</Text>
      <Pressable style={styles.row} onPress={() => requestAppReview()}>
        <Text style={styles.rowText}>{t('settings.rateRow')}</Text>
        <Ionicons name="star-outline" size={18} color={colors.textSecondary} />
      </Pressable>
      <Pressable style={styles.row} onPress={handleReportPress}>
        <Text style={styles.rowText}>{t('settings.reportRow')}</Text>
        <Ionicons name="mail-outline" size={18} color={colors.textSecondary} />
      </Pressable>

      <Text style={styles.sectionHeader}>{t('settings.legalSection')}</Text>
      <Pressable style={styles.row} onPress={() => navigation.navigate('Terms')}>
        <Text style={styles.rowText}>{t('settings.termsRow')}</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => navigation.navigate('Privacy')}>
        <Text style={styles.rowText}>{t('settings.privacyRow')}</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
      {__DEV__ && (
        <Pressable
          style={styles.row}
          onPress={() => AsyncStorage.clear().then(() => DevSettings.reload())}
        >
          <View style={styles.devRowLabel}>
            <Ionicons name="bug-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.rowText}>Reset Onboarding</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background, padding: 20, gap: 10 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.card,
      borderRadius: 14,
      paddingVertical: 16,
      paddingHorizontal: 18,
    },
    rowText: { color: colors.textPrimary, fontSize: 16 },
    chevron: { color: colors.textSecondary, fontSize: 20 },
    sectionHeader: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 8,
      marginBottom: -4,
    },
    devRowLabel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    versionText: {
      color: colors.textSecondary,
      fontSize: 13,
      textAlign: 'center',
      marginBottom: 4,
    },
  });
}
