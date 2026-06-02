/**
 * Design tokens for Sober Living Companion.
 *
 * The palette is intentionally calm and warm rather than clinical — families
 * using this app are often under stress, so we lean on soft greens (growth,
 * recovery), warm neutrals, and gentle accents. Crisis-related UI is the one
 * place we use a clear, urgent color so it can never be missed.
 */

export const colors = {
  // Brand / primary — a calm, hopeful teal-green
  primary: '#3E8E7E',
  primaryDark: '#2F6B5F',
  primaryLight: '#E4F1ED',

  // Warm accent for highlights, milestones, celebration
  accent: '#E8A87C',
  accentLight: '#FBEDE3',

  // Surfaces
  background: '#F7F5F1', // warm off-white
  surface: '#FFFFFF',
  surfaceAlt: '#F0EEE8',

  // Text
  textPrimary: '#2B2B2B',
  textSecondary: '#6B6B6B',
  textMuted: '#9A9A9A',
  textInverse: '#FFFFFF',

  // Mood scale (1 = struggling, 5 = thriving)
  mood1: '#C26B6B',
  mood2: '#D89B6A',
  mood3: '#D9C16A',
  mood4: '#9FC06A',
  mood5: '#6AAE8E',

  // Status / feedback
  success: '#5FA877',
  warning: '#D9A441',

  // Crisis — deliberately distinct and urgent. Never reused elsewhere.
  crisis: '#C0392B',
  crisisBg: '#FBEAE7',

  border: '#E3E0D9',
  divider: '#ECEAE4',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, color: colors.textPrimary },
  h2: { fontSize: 22, fontWeight: '700' as const, color: colors.textPrimary },
  h3: { fontSize: 18, fontWeight: '600' as const, color: colors.textPrimary },
  body: { fontSize: 16, fontWeight: '400' as const, color: colors.textPrimary },
  bodySecondary: { fontSize: 15, fontWeight: '400' as const, color: colors.textSecondary },
  caption: { fontSize: 13, fontWeight: '400' as const, color: colors.textMuted },
  button: { fontSize: 16, fontWeight: '600' as const, color: colors.textInverse },
} as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
} as const;
