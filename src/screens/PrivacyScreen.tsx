import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import PrivacyContent from '../components/PrivacyContent';
import { Colors } from '../theme/colors';

export default function PrivacyScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <PrivacyContent />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 40 },
});
