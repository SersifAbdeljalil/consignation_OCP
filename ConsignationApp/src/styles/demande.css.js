// src/styles/demande.css.js
import { StyleSheet, Dimensions } from 'react-native';
import { COLORS, FONTS, SPACE, RADIUS } from './variables.css';

const { width } = Dimensions.get('window');

const demandeStyles = StyleSheet.create({

  container: { flex: 1, backgroundColor: COLORS.background },

  // ── HEADER ──────────────────────────────────
  header: {
    backgroundColor: COLORS.green,
    paddingTop: 50,
    paddingBottom: SPACE.base,
    paddingHorizontal: SPACE.base,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 4,
    shadowColor: COLORS.greenDark,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  headerTitle: {
    flex: 1,
    color: COLORS.white,
    fontSize: FONTS.size.xl,
    fontWeight: FONTS.weight.bold,
    textAlign: 'center',
  },
  backBtn: {
    width: 36, height: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: { width: 36 },

  // ── FORMULAIRE ──────────────────────────────
  formBody: {
    flex: 1,
    padding: SPACE.base,
  },
  formCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.lg,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  formGroup: { marginBottom: SPACE.base },
  formLabel: {
    fontSize: FONTS.size.sm,
    fontWeight: FONTS.weight.semibold,
    color: COLORS.grayDark,
    marginBottom: SPACE.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  required: { color: COLORS.error },
  formInput: {
    borderWidth: 1.5,
    borderColor: COLORS.grayMedium,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.grayPale,
    paddingHorizontal: SPACE.md,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  formInputText: { fontSize: FONTS.size.base, color: COLORS.grayDeep, flex: 1 },
  formInputPlaceholder: { fontSize: FONTS.size.base, color: COLORS.gray, flex: 1 },
  formTextarea: {
    borderWidth: 1.5,
    borderColor: COLORS.grayMedium,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.grayPale,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.md,
    height: 90,
    fontSize: FONTS.size.base,
    color: COLORS.grayDeep,
    textAlignVertical: 'top',
  },

  // ── BOUTONS ──────────────────────────────────
  btnPrimary: {
    backgroundColor: COLORS.green,
    borderRadius: RADIUS.md,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: SPACE.sm,
    elevation: 4,
    shadowColor: COLORS.green,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  btnPrimaryText: {
    color: COLORS.white,
    fontSize: FONTS.size.md,
    fontWeight: FONTS.weight.extrabold,
    letterSpacing: FONTS.letterSpacing.wider,
    marginLeft: SPACE.sm,
  },
  btnDisabled: { opacity: 0.65 },

  // ── LISTE DEMANDES ───────────────────────────
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACE.base,
    paddingVertical: SPACE.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayMedium,
    gap: SPACE.sm,
  },
  filterChip: {
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.grayMedium,
    backgroundColor: COLORS.white,
  },
  filterChipActive: {
    backgroundColor: COLORS.green,
    borderColor: COLORS.green,
  },
  filterChipText: { fontSize: FONTS.size.xs, fontWeight: FONTS.weight.semibold, color: COLORS.gray },
  filterChipTextActive: { color: COLORS.white },

  listContent: { padding: SPACE.base, paddingBottom: SPACE.xxxl },

  demandeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.base,
    marginBottom: SPACE.md,
    borderLeftWidth: 4,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  demandeTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.xs,
  },
  demandeNum: { fontSize: FONTS.size.sm, fontWeight: FONTS.weight.extrabold, color: COLORS.grayDark },
  demandeEquip: { fontSize: FONTS.size.base, fontWeight: FONTS.weight.semibold, color: COLORS.grayDeep, marginBottom: SPACE.xs },
  demandeRaison: { fontSize: FONTS.size.sm, color: COLORS.gray, marginBottom: SPACE.sm },
  demandeBottom: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  demandeDate: { fontSize: FONTS.size.xs, color: COLORS.gray, marginLeft: SPACE.xs },

  // ── BADGE STATUT ─────────────────────────────
  badge: {
    paddingHorizontal: SPACE.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  badgeText: { fontSize: 9, fontWeight: FONTS.weight.bold, letterSpacing: 0.5 },

  // ── EMPTY STATE ──────────────────────────────
  emptyContainer: {
    flex: 1, alignItems: 'center',
    justifyContent: 'center', paddingTop: 60,
  },
  emptyText: { fontSize: FONTS.size.base, color: COLORS.gray, marginTop: SPACE.base },
  emptySubText: { fontSize: FONTS.size.sm, color: COLORS.grayMedium, marginTop: SPACE.xs },
});

export default demandeStyles;