import React from 'react';
import { View, Text, Pressable, StyleSheet, DevSettings } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SettingsStackParamList } from '../navigation/types';
import { Colors } from '../theme/colors';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.screen}>
      <Pressable style={styles.row} onPress={() => navigation.navigate('Language')}>
        <Text style={styles.rowText}>{t('settings.languageRow')}</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
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
            <Ionicons name="bug-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.rowText}>Reset Onboarding</Text>
          </View>
        </Pressable>
      )}
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
  chevron: { color: Colors.textSecondary, fontSize: 20 },
  devRowLabel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
