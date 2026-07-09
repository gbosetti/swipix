import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import TermsContent from '../components/TermsContent';

export default function TermsScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TermsContent />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  content: { padding: 20, paddingBottom: 40 },
});
