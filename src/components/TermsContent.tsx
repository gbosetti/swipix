import React from 'react';
import { Text, StyleSheet } from 'react-native';

/**
 * The terms text itself, shared between the onboarding modal and the
 * standalone Terms screen reachable from Settings — one source of truth
 * so the two never drift out of sync. Full legal text lives in TERMS.md.
 */
export default function TermsContent() {
  return (
    <>
      <Text style={styles.paragraph}>
        Swipix helps you review and delete photos on your device. You're
        responsible for the choices you make while using it — including
        which photos you delete.
      </Text>
      <Text style={styles.paragraph}>
        Deleted photos go to a temporary trash first, but once you confirm
        permanent deletion (automatically after the grace period, or
        manually), it cannot be undone by the app. Make sure anything
        important is backed up elsewhere.
      </Text>
      <Text style={styles.paragraph}>
        The app is provided "as is," with no warranty of any kind. To the
        fullest extent permitted by law, the developer isn't liable for any
        loss of photos or data from using this app.
      </Text>
      <Text style={styles.paragraph}>Full terms are in TERMS.md.</Text>
    </>
  );
}

const styles = StyleSheet.create({
  paragraph: { color: '#c7c7cc', fontSize: 15, lineHeight: 22, marginBottom: 16 },
});
