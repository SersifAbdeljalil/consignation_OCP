// src/styles/profil.css.js
import { StyleSheet } from 'react-native';
import { COLORS, FONTS, SPACE, RADIUS } from './variables.css';

const profilStyles = StyleSheet.create({

  container: { flex: 1, backgroundColor: COLORS.background },

  // ── HEADER ───────────────────────────────────
  header: {
    backgroundColor: COLORS.green,
    paddingTop: 50,
    paddingBottom: SPACE.xxxl,
    alignItems: 'center',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    elevation: 4,
    shadowColor: COLORS.greenDark,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    overflow: 'hidden',
  },
  headerDeco: {
    position: 'absolute',
    bottom: -30, right: -30,
    width: 120, height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.blue,
    opacity: 0.15,
  },
  avatar: {
    width: 75, height: 75,
    borderRadius: 37.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.sm,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  profilName: {
    color: COLORS.white,
    fontSize: FONTS.size.xl,
    fontWeight: FONTS.weight.extrabold,
    marginBottom: 3,
  },
  profilRole: {
    color: '#A5D6A7',
    fontSize: FONTS.size.xs,
    letterSpacing: FONTS.letterSpacing.wider,
  },

  // ── BODY ─────────────────────────────────────
  body: { padding: SPACE.base, paddingTop: SPACE.lg },

  // ── CARD ─────────────────────────────────────
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.base,
    marginBottom: SPACE.md,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  cardTitle: {
    fontSize: FONTS.size.md,
    fontWeight: FONTS.weight.bold,
    color: COLORS.grayDeep,
    marginBottom: SPACE.md,
    paddingBottom: SPACE.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayMedium,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },

  // ── INFO ROW ─────────────────────────────────
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACE.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { fontSize: FONTS.size.sm, color: COLORS.gray },
  infoValue: { fontSize: FONTS.size.sm, fontWeight: FONTS.weight.semibold, color: COLORS.grayDeep },

  // ── TÉLÉPHONE ────────────────────────────────
  telRow: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.sm },
  telCountryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    borderWidth: 1.5,
    borderColor: COLORS.grayMedium,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.sm,
    backgroundColor: COLORS.grayPale,
  },
  telCountryText: { fontSize: FONTS.size.sm, fontWeight: FONTS.weight.semibold, color: COLORS.grayDeep },
  telInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.grayMedium,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    height: 46,
    fontSize: FONTS.size.base,
    backgroundColor: COLORS.grayPale,
    color: COLORS.grayDeep,
  },

  // ── LISTE PAYS ───────────────────────────────
  countryList: {
    marginTop: SPACE.sm,
    borderWidth: 1.5,
    borderColor: COLORS.green,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  countryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACE.md,
    gap: SPACE.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayMedium,
  },
  countryOptionSelected: { backgroundColor: COLORS.greenPale },
  countryOptionText: { fontSize: FONTS.size.sm, color: COLORS.grayDeep, flex: 1 },
  countryOptionTextSelected: { color: COLORS.green, fontWeight: FONTS.weight.bold },

  // ── SMS INFO ─────────────────────────────────
  smsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bluePale,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.blue,
    marginTop: SPACE.sm,
    gap: SPACE.sm,
  },
  smsText: { fontSize: FONTS.size.xs, color: COLORS.blue, flex: 1, lineHeight: FONTS.lineHeight.normal },

  // ── BOUTONS ──────────────────────────────────
  btnSave: {
    backgroundColor: COLORS.green,
    borderRadius: RADIUS.md,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: SPACE.sm,
    marginTop: SPACE.md,
    elevation: 3,
    shadowColor: COLORS.green,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  btnSaveText: { color: COLORS.white, fontSize: FONTS.size.sm, fontWeight: FONTS.weight.extrabold, letterSpacing: 1 },
  btnOutline: {
    borderWidth: 1.5,
    borderColor: COLORS.green,
    borderRadius: RADIUS.md,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: SPACE.sm,
  },
  btnOutlineText: { color: COLORS.green, fontSize: FONTS.size.sm, fontWeight: FONTS.weight.bold },
  btnDanger: {
    borderWidth: 1.5,
    borderColor: COLORS.error,
    borderRadius: RADIUS.md,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: SPACE.sm,
    marginTop: SPACE.sm,
  },
  btnDangerText: { color: COLORS.error, fontSize: FONTS.size.sm, fontWeight: FONTS.weight.bold },
});

export default profilStyles;