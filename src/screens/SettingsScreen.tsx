import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SettingsStackParamList } from '../navigation/types';
import { Colors } from '../theme/colors';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  return (
    <View style={styles.screen}>
      <Pressable style={styles.row} onPress={() => navigation.navigate('Terms')}>
        <Text style={styles.rowText}>Terms of Use</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background, padding: 20 },
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
});
