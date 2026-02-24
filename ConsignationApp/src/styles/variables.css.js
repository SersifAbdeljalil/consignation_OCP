// src/styles/variables.css.js
// ═══════════════════════════════════════════════
//  VARIABLES GLOBALES — Palette KOFERT
//  Importer ce fichier dans tous les .css.js
// ═══════════════════════════════════════════════

// ── COULEURS ────────────────────────────────────
export const COLORS = {
  // Verts (couleur principale KOFERT)
  green:        '#2E7D32',
  greenLight:   '#4CAF50',
  greenDark:    '#1B5E20',
  greenPale:    '#E8F5E9',

  // Bleus (couleur secondaire KOFERT)
  blue:         '#1565C0',
  blueLight:    '#1E88E5',
  blueDark:     '#0D47A1',
  bluePale:     '#E3F2FD',

  // Fond application
  background:   '#F5F5F5',   // fond général
  surface:      '#FFFFFF',   // fond cartes

  // Neutres
  white:        '#FFFFFF',
  black:        '#000000',
  grayPale:     '#F5F5F5',
  grayLight:    '#EEEEEE',
  grayMedium:   '#E0E0E0',
  gray:         '#9E9E9E',
  grayDark:     '#424242',
  grayDeep:     '#212121',

  // Statuts
  success:      '#2E7D32',
  warning:      '#F57F17',
  error:        '#C62828',
  info:         '#1565C0',

  // Statuts demande
  statut: {
    en_attente:  '#F57F17',
    validee:     '#2E7D32',
    rejetee:     '#C62828',
    en_cours:    '#1565C0',
    deconsignee: '#6A1B9A',
    cloturee:    '#37474F',
  },
};

// ── TYPOGRAPHIE ─────────────────────────────────
export const FONTS = {
  size: {
    xs:   10,
    sm:   12,
    md:   14,
    base: 15,
    lg:   16,
    xl:   18,
    xxl:  22,
    xxxl: 26,
    huge: 32,
  },
  weight: {
    light:     '300',
    regular:   '400',
    medium:    '500',
    semibold:  '600',
    bold:      '700',
    extrabold: '800',
    black:     '900',
  },
  lineHeight: {
    tight:   16,
    normal:  20,
    relaxed: 24,
    loose:   30,
  },
  letterSpacing: {
    tight:  -0.5,
    normal:  0,
    wide:    0.5,
    wider:   1,
    widest:  2,
  },
};

// ── ESPACEMENTS ─────────────────────────────────
export const SPACE = {
  xs:   4,
  sm:   8,
  md:   12,
  base: 16,
  lg:   20,
  xl:   24,
  xxl:  32,
  xxxl: 48,
};

// ── BORDER RADIUS ───────────────────────────────
export const RADIUS = {
  sm:   6,
  md:   10,
  lg:   14,
  xl:   20,
  xxl:  30,
  full: 999,
};

// ── OMBRES ──────────────────────────────────────
export const SHADOW = {
  sm: {
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  md: {
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  lg: {
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 5 },
  },
  green: {
    elevation: 5,
    shadowColor: '#2E7D32',
    shadowOpacity: 0.40,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
};