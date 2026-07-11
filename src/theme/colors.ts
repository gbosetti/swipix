/**
 * Single source of truth for color values across the app. Change a color
 * here once instead of hunting through every screen's StyleSheet.
 *
 * accent/success are sampled from the app icon's gradient (mint -> sky
 * blue) rather than plain iOS system colors, so the UI's own interactive
 * color actually matches the brand instead of just "a blue."
 */
export const Colors = {
  background: '#000000',
  card: '#1c1c1e',
  cardAlt: '#2c1c1e',
  cardDark: '#111111',
  placeholder: '#333333',

  accent: '#35b4fd',
  danger: '#ff3b30',
  success: '#30d992',

  textPrimary: '#ffffff',
  textSecondary: '#8e8e93',
  textTertiary: '#c7c7cc',
  trackInactive: '#3a3a3c',
} as const;
