import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

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
 * threw, so the fallback is plain and self-contained. No crash reporting
 * wired up on purpose (Swipix has no analytics anywhere).
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
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
