// src/styles/change.css.js
import { StyleSheet } from 'react-native';
import { COLORS, FONTS, SPACE, RADIUS, SHADOW } from './variables.css';

const changeStyles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ── HEADER ──────────────────────────────────
  header: {
    backgroundColor: COLORS.green,
    paddingTop: 50,
    paddingBottom: SPACE.base,
    paddingHorizontal: SPACE.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...SHADOW.green,
  },
  headerTitle: {
    fontSize: FONTS.size.xl,
    fontWeight: FONTS.weight.bold,
    color: COLORS.white,
    flex: 1,
    textAlign: 'center',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 24,
    color: COLORS.white,
    fontWeight: FONTS.weight.bold,
  },

  // ── BODY ────────────────────────────────────
  body: {
    flex: 1,
    padding: SPACE.base,
  },

  // ── INFO BOX ────────────────────────────────
  infoBox: {
    backgroundColor: COLORS.bluePale,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    marginBottom: SPACE.base,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.blue,
  },
  infoText: {
    color: COLORS.blue,
    fontSize: FONTS.size.sm,
    lineHeight: FONTS.lineHeight.normal,
  },

  // ── CARD ────────────────────────────────────
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.lg,
    ...SHADOW.md,
  },

  // ── CHAMPS ──────────────────────────────────
  inputGroup: {
    marginBottom: SPACE.base,
  },
  inputLabel: {
    fontSize: FONTS.size.sm,
    fontWeight: FONTS.weight.semibold,
    color: COLORS.grayDark,
    marginBottom: SPACE.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.grayMedium,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.grayPale,
    paddingHorizontal: SPACE.md,
    height: 52,
  },
  inputIcon: {
    fontSize: 16,
    marginRight: SPACE.sm,
  },
  input: {
    flex: 1,
    fontSize: FONTS.size.base,
    color: COLORS.grayDeep,
  },
  eyeBtn: {
    padding: SPACE.xs,
  },

  // ── ERREUR ──────────────────────────────────
  errorBox: {
    backgroundColor: '#FFEBEE',
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    marginBottom: SPACE.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.error,
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONTS.size.sm,
  },

  // ── BOUTON ──────────────────────────────────
  btn: {
    backgroundColor: COLORS.green,
    borderRadius: RADIUS.md,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACE.sm,
    ...SHADOW.green,
  },
  btnDisabled: {
    opacity: 0.65,
  },
  btnText: {
    color: COLORS.white,
    fontSize: FONTS.size.sm,
    fontWeight: FONTS.weight.extrabold,
    letterSpacing: FONTS.letterSpacing.wider,
  },
});

export default changeStyles;