import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, Alert, BackHandler, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import TermsContent from '../components/TermsContent';
import PrivacyContent from '../components/PrivacyContent';
import { Colors } from '../theme/colors';

type LegalModal = 'terms' | 'privacy' | null;

interface OnboardingScreenProps {
  onAccept: () => void;
}

/**
 * Shown once, before any other screen. Leads with what the app actually
 * does — trust and orientation first — rather than opening on a wall of
 * legal text. The final step's "Get Started" button is the one place
 * agreement is actually captured, folded into the natural next step
 * instead of a separate intimidating gate.
 */
export default function OnboardingScreen({ onAccept }: OnboardingScreenProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [legalModal, setLegalModal] = useState<LegalModal>(null);

  const steps = [
    { icon: '👋', title: t('onboarding.step1Title'), body: t('onboarding.step1Body') },
    { icon: '🫱🫲', title: t('onboarding.step2Title'), body: t('onboarding.step2Body') },
    { icon: '♻️', title: t('onboarding.step3Title'), body: t('onboarding.step3Body') },
  ];
  const isLastStep = step === steps.length - 1;
  const current = steps[step];

  const handleDecline = () => {
    if (Platform.OS === 'android') {
      BackHandler.exitApp();
      return;
    }
    Alert.alert(t('onboarding.declineTitle'), t('onboarding.declineBody'));
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>{current.icon}</Text>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.body}>{current.body}</Text>
      </View>

      <View style={styles.dots}>
        {steps.map((_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>

      {isLastStep && (
        <View style={styles.termsLinkWrap}>
          <Text style={styles.termsLink}>
            {t('onboarding.termsLinkPrefix')}
            <Text
              style={styles.termsLinkUnderline}
              onPress={() => setLegalModal('terms')}
              suppressHighlighting
            >
              {t('onboarding.termsLinkUnderline')}
            </Text>
            {t('onboarding.andConnector')}
            <Text
              style={styles.termsLinkUnderline}
              onPress={() => setLegalModal('privacy')}
              suppressHighlighting
            >
              {t('nav.privacy')}
            </Text>
          </Text>
        </View>
      )}

      <Pressable
        style={styles.button}
        onPress={() => (isLastStep ? onAccept() : setStep((s) => s + 1))}
      >
        <Text style={styles.buttonText}>{isLastStep ? t('onboarding.getStarted') : t('onboarding.next')}</Text>
      </Pressable>
      <Pressable style={styles.declineButton} onPress={handleDecline} hitSlop={8}>
        <Text style={styles.declineButtonText}>{t('onboarding.decline')}</Text>
      </Pressable>

      <Modal
        visible={legalModal !== null}
        animationType="slide"
        onRequestClose={() => setLegalModal(null)}
      >
        <View style={styles.termsModal}>
          <ScrollView contentContainerStyle={styles.termsContent}>
            <Text style={styles.termsTitle}>
              {legalModal === 'privacy' ? t('nav.privacy') : t('onboarding.termsTitle')}
            </Text>
            {legalModal === 'privacy' ? <PrivacyContent /> : <TermsContent />}
          </ScrollView>
          <Pressable
            style={styles.closeTermsButton}
            onPress={() => setLegalModal(null)}
          >
            <Text style={styles.closeTermsButtonText}>{t('onboarding.close')}</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, justifyContent: 'flex-end' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  icon: { fontSize: 64, marginBottom: 12 },
  title: { color: Colors.textPrimary, fontSize: 24, fontWeight: '700', textAlign: 'center' },
  body: { color: Colors.textTertiary, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.trackInactive },
  dotActive: { backgroundColor: Colors.accent },
  termsLinkWrap: { alignItems: 'center', marginBottom: 12 },
  termsLink: { color: Colors.textSecondary, fontSize: 13, textAlign: 'center' },
  termsLinkUnderline: { textDecorationLine: 'underline', color: Colors.textTertiary },
  button: {
    marginHorizontal: 20,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: Colors.textPrimary, fontSize: 16, fontWeight: '600' },
  declineButton: { marginTop: 12, marginBottom: 24, alignItems: 'center' },
  declineButtonText: { color: Colors.textSecondary, fontSize: 14 },
  termsModal: { flex: 1, backgroundColor: Colors.background },
  termsContent: { padding: 24, paddingTop: 60, gap: 16 },
  termsTitle: { color: Colors.textPrimary, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  closeTermsButton: {
    margin: 20,
    backgroundColor: Colors.card,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  closeTermsButtonText: { color: Colors.textPrimary, fontSize: 16, fontWeight: '600' },
});
