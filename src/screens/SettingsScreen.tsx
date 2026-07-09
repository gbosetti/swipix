import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

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
  screen: { flex: 1, backgroundColor: '#000', padding: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1c1c1e',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  rowText: { color: 'white', fontSize: 16 },
  chevron: { color: '#8e8e93', fontSize: 20 },
});
