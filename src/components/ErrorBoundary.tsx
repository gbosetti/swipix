import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Sentry from '@sentry/react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Last line of defense — without this, an uncaught render error crashes
 * to a blank screen with no way back except force-quitting.
 *
 * @remarks
 * Deliberately outside ThemeProvider in App.tsx and not using
 * useColors()/t() — must keep working even if theme/i18n setup itself
 * threw, so the fallback is plain and self-contained. Native crashes are
 * already captured automatically by Sentry.init() in App.tsx regardless
 * of this boundary; componentDidCatch below only covers the separate
 * case of a caught JS render error, so both crash categories are visible
 * in Sentry, not just native ones.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    /**
     * Reporting the crash must never prevent showing the fallback UI
     * below — that's the one thing this component exists to guarantee.
     */
    try {
      Sentry.captureException(error, {
        contexts: { react: { componentStack: errorInfo.componentStack } },
      });
    } catch (reportingError) {
      /**
       * The fallback UI below renders regardless — this is purely so a
       * failure to report the crash still leaves a trail somewhere (the
       * OS's own system log) instead of vanishing with zero record at all.
       */
      console.warn('Sentry.captureException failed:', reportingError);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            Swipix ran into an unexpected error. Nothing on your device was changed by this.
          </Text>
          <Pressable style={styles.button} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  title: { color: '#ffffff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  body: { color: '#a0a0a0', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  button: {
    marginTop: 16,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  buttonText: { color: '#000000', fontSize: 16, fontWeight: '600' },
});
