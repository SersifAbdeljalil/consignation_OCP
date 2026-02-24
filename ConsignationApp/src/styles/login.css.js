// src/styles/login.css.js
import { StyleSheet, Dimensions, Platform } from 'react-native';
import { COLORS, FONTS, SPACE, RADIUS } from './variables.css';

const { width, height } = Dimensions.get('window');

const loginStyles = StyleSheet.create({
  loginContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
  },

  loginHeader: {
    width: '100%',
    height: height * 0.33,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomLeftRadius: 44,
    borderBottomRightRadius: 44,
    // ✅ iOS : pas de overflow:hidden pour garder les shadows
    ...Platform.select({
      ios: {
        shadowColor: COLORS.greenDark,
        shadowOpacity: 0.4,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 5 },
      },
      android: {
        overflow: 'hidden',
        elevation: 8,
      },
    }),
  },

  headerDecoBlue: {
    position: 'absolute',
    bottom: -30, right: -30,
    width: 130, height: 130,
    borderRadius: 65,
    backgroundColor: COLORS.blue,
    opacity: 0.18,
  },

  headerDecoGreen: {
    position: 'absolute',
    top: -20, left: -20,
    width: 90, height: 90,
    borderRadius: 45,
    backgroundColor: COLORS.greenDark,
    opacity: 0.25,
  },

  loginCard: {
    width: width * 0.9,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACE.xl,
    marginTop: -SPACE.xxl,
    // ✅ iOS shadow
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 6 },
      },
      android: {
        elevation: 12,
      },
    }),
  },

  cardTitle: {
    fontSize: FONTS.size.xxl,
    fontWeight: FONTS.weight.extrabold,
    color: COLORS.grayDeep,
    marginBottom: SPACE.xs,
  },

  cardSubtitle: {
    fontSize: FONTS.size.sm,
    color: COLORS.gray,
    marginBottom: SPACE.xl,
    lineHeight: FONTS.lineHeight.normal,
  },

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

  input: {
    flex: 1,
    fontSize: FONTS.size.base,
    color: COLORS.grayDeep,
    // ✅ iOS : éviter le fond bleu sur autofill
    ...Platform.select({
      ios: {
        paddingVertical: 0,
      },
    }),
  },

  eyeBtn: {
    padding: SPACE.xs,
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
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
    flex: 1,
  },

  loginBtn: {
    backgroundColor: COLORS.green,
    borderRadius: RADIUS.md,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACE.sm,
    // ✅ iOS shadow sur bouton
    ...Platform.select({
      ios: {
        shadowColor: COLORS.green,
        shadowOpacity: 0.45,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 5,
      },
    }),
  },

  loginBtnDisabled: { opacity: 0.65 },

  loginBtnText: {
    color: COLORS.white,
    fontSize: FONTS.size.md,
    fontWeight: FONTS.weight.extrabold,
    letterSpacing: FONTS.letterSpacing.widest,
  },

  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACE.base,
  },

  separatorLine: {
    flex: 1, height: 1,
    backgroundColor: COLORS.grayMedium,
  },

  separatorText: {
    marginHorizontal: SPACE.sm,
    fontSize: FONTS.size.xs,
    color: COLORS.gray,
    letterSpacing: FONTS.letterSpacing.wide,
  },

  helpText: {
    fontSize: FONTS.size.xs,
    color: COLORS.gray,
  },

  footer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 34 : 16, // ✅ iOS safe area
    fontSize: FONTS.size.xs,
    color: COLORS.gray,
    letterSpacing: FONTS.letterSpacing.wide,
  },
});

export default loginStyles;