import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, Alert, BackHandler, Modal } from 'react-native';
import TermsContent from '../components/TermsContent';

interface OnboardingScreenProps {
  onAccept: () => void;
}

const STEPS = [
  {
    icon: '👋',
    title: 'Welcome to Swipix',
    body: 'A fast, focused way to clean up your photo library — one swipe at a time.',
  },
  {
    icon: '🫱🫲',
    title: 'Swipe left to trash, right to keep',
    body: 'Pick a category, then swipe through candidates. Left queues a photo for deletion, right keeps it.',
  },
  {
    icon: '♻️',
    title: "Nothing's deleted forever",
    body: 'Trashed photos wait in a grace period before anything is permanent — review or restore them anytime.',
  },
];

/**
 * Shown once, before any other screen. Leads with what the app actually
 * does — trust and orientation first — rather than opening on a wall of
 * legal text. The final step's "Get Started" button is the one place
 * agreement is actually captured, folded into the natural next step
 * instead of a separate intimidating gate.
 */
export default function OnboardingScreen({ onAccept }: OnboardingScreenProps) {
  const [step, setStep] = useState(0);
  const [termsVisible, setTermsVisible] = useState(false);
  const isLastStep = step === STEPS.length - 1;
  const current = STEPS[step];

  const handleDecline = () => {
    if (Platform.OS === 'android') {
      BackHandler.exitApp();
      return;
    }
    Alert.alert(
      "Can't continue without agreeing",
      'Swipix needs you to accept the Terms of Use to work. If you\'d rather not, please close the app — nothing has been set up or accessed yet.'
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>{current.icon}</Text>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.body}>{current.body}</Text>
      </View>

      <View style={styles.dots}>
        {STEPS.map((_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>

      {isLastStep && (
        <Pressable onPress={() => setTermsVisible(true)} hitSlop={8} style={styles.termsLinkWrap}>
          <Text style={styles.termsLink}>
            By continuing, you agree to our{' '}
            <Text style={styles.termsLinkUnderline}>Terms of Use</Text>
          </Text>
        </Pressable>
      )}

      <Pressable
        style={styles.button}
        onPress={() => (isLastStep ? onAccept() : setStep((s) => s + 1))}
      >
        <Text style={styles.buttonText}>{isLastStep ? 'Get Started' : 'Next'}</Text>
      </Pressable>
      <Pressable style={styles.declineButton} onPress={handleDecline} hitSlop={8}>
        <Text style={styles.declineButtonText}>Decline</Text>
      </Pressable>

      <Modal
        visible={termsVisible}
        animationType="slide"
        onRequestClose={() => setTermsVisible(false)}
      >
        <View style={styles.termsModal}>
          <ScrollView contentContainerStyle={styles.termsContent}>
            <Text style={styles.termsTitle}>Terms of Use</Text>
            <TermsContent />
          </ScrollView>
          <Pressable
            style={styles.closeTermsButton}
            onPress={() => setTermsVisible(false)}
          >
            <Text style={styles.closeTermsButtonText}>Close</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'flex-end' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  icon: { fontSize: 64, marginBottom: 12 },
  title: { color: 'white', fontSize: 24, fontWeight: '700', textAlign: 'center' },
  body: { color: '#c7c7cc', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3a3a3c' },
  dotActive: { backgroundColor: '#0a84ff' },
  termsLinkWrap: { alignItems: 'center', marginBottom: 12 },
  termsLink: { color: '#8e8e93', fontSize: 13, textAlign: 'center' },
  termsLinkUnderline: { textDecorationLine: 'underline', color: '#c7c7cc' },
  button: {
    marginHorizontal: 20,
    backgroundColor: '#0a84ff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  declineButton: { marginTop: 12, marginBottom: 24, alignItems: 'center' },
  declineButtonText: { color: '#8e8e93', fontSize: 14 },
  termsModal: { flex: 1, backgroundColor: '#000' },
  termsContent: { padding: 24, paddingTop: 60, gap: 16 },
  termsTitle: { color: 'white', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  closeTermsButton: {
    margin: 20,
    backgroundColor: '#1c1c1e',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  closeTermsButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
});
