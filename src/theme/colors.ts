export interface ColorPalette {
  background: string;
  card: string;
  cardAlt: string;
  cardDark: string;
  placeholder: string;

  accent: string;
  danger: string;
  success: string;
  /** Text/icon color for anything sitting on an accent/danger/success
   * surface. Those three stay constant across themes, so text on top of
   * them must too — it should never flip to textPrimary's black in
   * light mode, which would read as low-contrast on a colored button. */
  onBrand: string;

  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  trackInactive: string;
}

/**
 * Single source of truth for color values across the app.
 *
 * @remarks
 * accent/success are sampled from the app icon's gradient, not plain iOS
 * system colors, and stay identical between light and dark — a brand
 * color shouldn't change with appearance mode, only the neutrals should.
 */
export const DarkColors: ColorPalette = {
  background: '#000000',
  card: '#1c1c1e',
  cardAlt: '#2c1c1e',
  cardDark: '#111111',
  placeholder: '#333333',

  accent: '#35b4fd',
  danger: '#ff3b30',
  success: '#30d992',
  onBrand: '#ffffff',

  textPrimary: '#ffffff',
  textSecondary: '#8e8e93',
  textTertiary: '#c7c7cc',
  trackInactive: '#3a3a3c',
};

export const LightColors: ColorPalette = {
  background: '#f2f2f7',
  card: '#ffffff',
  cardAlt: '#fde9e7',
  cardDark: '#e5e5ea',
  placeholder: '#d1d1d6',

  accent: '#35b4fd',
  danger: '#ff3b30',
  success: '#30d992',
  onBrand: '#ffffff',

  textPrimary: '#000000',
  textSecondary: '#8e8e93',
  textTertiary: '#48484a',
  trackInactive: '#d1d1d6',
};
