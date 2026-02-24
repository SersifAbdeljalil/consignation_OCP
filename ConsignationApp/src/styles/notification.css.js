// src/styles/notification.css.js
import { StyleSheet } from 'react-native';
import { COLORS, FONTS, SPACE, RADIUS } from './variables.css';

const notifStyles = StyleSheet.create({

  container: { flex: 1, backgroundColor: COLORS.background },

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
  markAllBtn: {
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs,
  },
  markAllText: {
    color: COLORS.white,
    fontSize: FONTS.size.xs,
    fontWeight: FONTS.weight.semibold,
    opacity: 0.9,
  },

  listContent: { padding: SPACE.base, paddingBottom: SPACE.xxxl },

  // ── CARTE NOTIFICATION ───────────────────────
  notifCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.base,
    marginBottom: SPACE.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  notifCardUnread: {
    backgroundColor: COLORS.greenPale,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.green,
  },

  // ── ICÔNE TYPE ───────────────────────────────
  notifIconContainer: {
    width: 42, height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACE.md,
  },

  // ── CONTENU ──────────────────────────────────
  notifContent: { flex: 1 },
  notifTitle: {
    fontSize: FONTS.size.sm,
    fontWeight: FONTS.weight.bold,
    color: COLORS.grayDeep,
    marginBottom: 3,
  },
  notifMessage: {
    fontSize: FONTS.size.sm,
    color: COLORS.gray,
    lineHeight: FONTS.lineHeight.normal,
    marginBottom: 4,
  },
  notifTime: {
    fontSize: FONTS.size.xs,
    color: COLORS.grayMedium,
  },

  // ── POINT NON LU ────────────────────────────
  unreadDot: {
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.green,
    marginLeft: SPACE.sm,
    marginTop: 4,
  },

  // ── EMPTY ────────────────────────────────────
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: FONTS.size.base,
    color: COLORS.gray,
    marginTop: SPACE.base,
  },
});

export default notifStyles;