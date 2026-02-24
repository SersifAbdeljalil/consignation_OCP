// src/components/shared/profil.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StatusBar, ActivityIndicator,
  Alert, Modal, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../../api/client';

// ── Couleurs centralisées (si variables.css non dispo) ─
const COLORS = {
  green:     '#2E7D32',
  greenDark: '#1B5E20',
  greenPale: '#E8F5E9',
  gray:      '#9E9E9E',
  grayDeep:  '#212121',
  grayDark:  '#424242',
  white:     '#FFFFFF',
  error:     '#EF4444',
  blue:      '#3B82F6',
};

// ── Pays disponibles ──────────────────────────
const PAYS = [
  { code: '+212', label: 'Maroc',        flag: '🇲🇦', placeholder: '06 XX XX XX XX' },
  { code: '+33',  label: 'France',       flag: '🇫🇷', placeholder: '06 XX XX XX XX' },
  { code: '+1',   label: 'USA / Canada', flag: '🇺🇸', placeholder: '(XXX) XXX-XXXX' },
  { code: '+44',  label: 'Royaume-Uni',  flag: '🇬🇧', placeholder: '07XXX XXXXXX'   },
];

// ── Map rôle → icône ──────────────────────────
const ROLE_ICON = {
  agent_production: 'construct-outline',
  chef_prod:        'briefcase-outline',
  hse:              'shield-checkmark-outline',
  electricien:      'flash-outline',
  chef_electricien: 'flash-sharp',
  chef_intervenant: 'people-outline',
  admin:            'settings-outline',
};

const ROLE_LABEL = {
  agent_production: 'Agent Production',
  chef_prod:        'Chef Production',
  hse:              'Responsable HSE',
  electricien:      'Électricien',
  chef_electricien: 'Chef Électricien',
  chef_intervenant: 'Chef Intervenant',
  admin:            'Administrateur',
};

// ── Initiales avatar ──────────────────────────
const getInitiales = (prenom, nom) => {
  const p = prenom ? prenom.charAt(0).toUpperCase() : '';
  const n = nom    ? nom.charAt(0).toUpperCase()    : '';
  return `${p}${n}` || '??';
};

export default function Profil({ navigation }) {
  const [user, setUser]                 = useState(null);
  const [telephone, setTelephone]       = useState('');
  const [paysIndex, setPaysIndex]       = useState(0);
  const [showPaysModal, setShowPays]    = useState(false);
  const [loadingTel, setLoadingTel]     = useState(false);
  const [codeVerif, setCodeVerif]       = useState('');
  const [showVerif, setShowVerif]       = useState(false);
  const [loadingVerif, setLoadingVerif] = useState(false);
  const [telErreur, setTelErreur]       = useState('');

  useEffect(() => {
    chargerUser();
  }, []);

  const chargerUser = async () => {
    try {
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) {
        const u = JSON.parse(userStr);
        setUser(u);
        // Parser le téléphone existant
        if (u.telephone) {
          const tel = u.telephone.trim();
          const idx = PAYS.findIndex(p => tel.startsWith(p.code));
          if (idx !== -1) {
            setPaysIndex(idx);
            // Retirer l'indicatif et l'espace éventuel
            setTelephone(tel.replace(PAYS[idx].code, '').trim());
          } else {
            setTelephone(tel);
          }
        }
      }
    } catch (e) {
      console.error('chargerUser error:', e);
    }
  };

  // ── Validation numéro ─────────────────────────
  const validerNumero = (num) => {
    const clean = num.replace(/\s/g, '');
    if (!clean) return 'Veuillez saisir un numéro de téléphone';
    if (clean.length < 8) return 'Numéro trop court (minimum 8 chiffres)';
    if (!/^\d+$/.test(clean)) return 'Le numéro ne doit contenir que des chiffres';
    return null;
  };

  // ── Enregistrer téléphone ─────────────────────
  const handleSauveTelephone = async () => {
    setTelErreur('');
    const erreur = validerNumero(telephone);
    if (erreur) { setTelErreur(erreur); return; }

    setLoadingTel(true);
    try {
      const pays = PAYS[paysIndex];
      const numeroComplet = `${pays.code} ${telephone.trim()}`;

      const res = await client.put('/users/telephone', {
        telephone: numeroComplet,
      });

      if (res.data.success) {
        setShowVerif(true);
        Alert.alert(
          '📱 Code envoyé',
          `Un code de vérification a été envoyé au\n${numeroComplet}`
        );
      } else {
        setTelErreur(res.data.message || 'Erreur lors de la mise à jour');
      }
    } catch (e) {
      console.error('handleSauveTelephone:', e);
      setTelErreur('Erreur de connexion au serveur');
    } finally {
      setLoadingTel(false);
    }
  };

  // ── Vérifier code SMS ─────────────────────────
  const handleVerifierCode = async () => {
    if (codeVerif.length !== 6) {
      Alert.alert('Erreur', 'Le code doit contenir exactement 6 chiffres');
      return;
    }
    setLoadingVerif(true);
    try {
      const res = await client.post('/users/verifier-telephone', { code: codeVerif });

      if (res.data.success) {
        setShowVerif(false);
        setCodeVerif('');

        // Mettre à jour AsyncStorage
        const pays = PAYS[paysIndex];
        const numeroComplet = `${pays.code} ${telephone.trim()}`;
        const userStr = await AsyncStorage.getItem('user');
        if (userStr) {
          const u = JSON.parse(userStr);
          u.telephone = numeroComplet;
          await AsyncStorage.setItem('user', JSON.stringify(u));
          setUser(u);
        }
        Alert.alert('✅ Succès', 'Numéro de téléphone vérifié et enregistré !');
      } else {
        Alert.alert('❌ Code incorrect', 'Le code saisi est incorrect. Réessayez.');
      }
    } catch (e) {
      console.error('handleVerifierCode:', e);
      Alert.alert('Erreur', 'Code incorrect ou expiré');
    } finally {
      setLoadingVerif(false);
    }
  };

  // ── Déconnexion ───────────────────────────────
  const handleDeconnexion = () => {
    Alert.alert(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnecter',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('token');
            await AsyncStorage.removeItem('user');
            navigation.replace('AuthStack');
          },
        },
      ]
    );
  };

  const pays = PAYS[paysIndex];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#F5F7FA' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={COLORS.greenDark} />

      {/* ══ HEADER ══ */}
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        {/* Avatar initiales */}
        <View style={S.avatarWrap}>
          <Text style={S.avatarText}>
            {user ? getInitiales(user.prenom, user.nom) : '??'}
          </Text>
        </View>

        <Text style={S.headerNom}>
          {user ? `${user.prenom} ${user.nom}` : '—'}
        </Text>

        {/* Rôle avec icône */}
        <View style={S.roleRow}>
          <Ionicons
            name={ROLE_ICON[user?.role] || 'person-outline'}
            size={13}
            color="#A5D6A7"
          />
          <Text style={S.headerRole}>
            {ROLE_LABEL[user?.role] || user?.role?.toUpperCase() || '—'}
          </Text>
        </View>

        {/* Matricule */}
        {user?.matricule && (
          <View style={S.matriculeRow}>
            <Ionicons name="card-outline" size={12} color="#81C784" />
            <Text style={S.matriculeText}>{user.matricule}</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={S.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ══ INFORMATIONS ══ */}
        <View style={S.card}>
          <View style={S.cardHeader}>
            <View style={S.cardIconWrap}>
              <Ionicons name="information-circle-outline" size={18} color={COLORS.green} />
            </View>
            <Text style={S.cardTitle}>Informations du compte</Text>
          </View>

          <InfoItem
            icon="person-badge-outline"
            iconName="card-outline"
            label="Matricule"
            value={user?.matricule || '—'}
          />
          <InfoItem
            iconName="business-outline"
            label="Entité"
            value={user?.entite || '—'}
          />
          <InfoItem
            iconName="briefcase-outline"
            label="Rôle"
            value={ROLE_LABEL[user?.role] || user?.role || '—'}
          />
          {user?.zone && (
            <InfoItem
              iconName="map-outline"
              label="Zone"
              value={user.zone}
            />
          )}
        </View>

        {/* ══ TÉLÉPHONE ══ */}
        <View style={S.card}>
          <View style={S.cardHeader}>
            <View style={S.cardIconWrap}>
              <Ionicons name="call-outline" size={18} color={COLORS.green} />
            </View>
            <Text style={S.cardTitle}>Numéro de téléphone</Text>
          </View>

          {/* Téléphone actuel */}
          {user?.telephone && (
            <View style={S.telActuelRow}>
              <Ionicons name="checkmark-circle" size={15} color={COLORS.green} />
              <Text style={S.telActuelText}>Actuel : {user.telephone}</Text>
            </View>
          )}

          {/* Champ saisie */}
          <View style={[S.telInputRow, telErreur && { borderColor: COLORS.error }]}>
            {/* Bouton indicatif pays */}
            <TouchableOpacity
              style={S.paysBtn}
              onPress={() => setShowPays(true)}
            >
              <Text style={S.paysFlag}>{pays.flag}</Text>
              <Text style={S.paysCode}>{pays.code}</Text>
              <Ionicons name="chevron-down" size={14} color={COLORS.gray} />
            </TouchableOpacity>

            {/* Séparateur vertical */}
            <View style={S.separator} />

            {/* Input numéro */}
            <TextInput
              style={S.telInput}
              placeholder={pays.placeholder}
              placeholderTextColor="#BDBDBD"
              value={telephone}
              onChangeText={t => {
                // ✅ FIX : accepter uniquement chiffres et espaces
                const clean = t.replace(/[^0-9\s]/g, '');
                setTelephone(clean);
                setTelErreur('');
              }}
              keyboardType="phone-pad"
              returnKeyType="done"
              blurOnSubmit={false}
              maxLength={15}
            />

            {/* Effacer */}
            {telephone.length > 0 && (
              <TouchableOpacity
                onPress={() => { setTelephone(''); setTelErreur(''); }}
                style={{ padding: 6 }}
              >
                <Ionicons name="close-circle" size={18} color="#BDBDBD" />
              </TouchableOpacity>
            )}
          </View>

          {/* Message erreur */}
          {telErreur ? (
            <View style={S.errRow}>
              <Ionicons name="warning-outline" size={13} color={COLORS.error} />
              <Text style={S.errText}>{telErreur}</Text>
            </View>
          ) : (
            <View style={S.infoSmsRow}>
              <Ionicons name="phone-portrait-outline" size={13} color={COLORS.blue} />
              <Text style={S.infoSmsText}>
                Un SMS de vérification sera envoyé après enregistrement
              </Text>
            </View>
          )}

          {/* Bouton enregistrer */}
          <TouchableOpacity
            style={[S.btnSave, loadingTel && { opacity: 0.65 }]}
            onPress={handleSauveTelephone}
            disabled={loadingTel}
            activeOpacity={0.85}
          >
            {loadingTel ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={18} color="#fff" />
                <Text style={S.btnSaveText}>ENREGISTRER</Text>
              </>
            )}
          </TouchableOpacity>

          {/* ── Zone vérification SMS ── */}
          {showVerif && (
            <View style={S.verifBox}>
              <View style={S.verifHeader}>
                <Ionicons name="mail-unread-outline" size={18} color={COLORS.green} />
                <Text style={S.verifTitle}>Vérification SMS</Text>
              </View>
              <Text style={S.verifSub}>
                Entrez le code à 6 chiffres reçu au {pays.code} {telephone}
              </Text>

              <TextInput
                style={S.codeInput}
                placeholder="• • • • • •"
                placeholderTextColor="#BDBDBD"
                value={codeVerif}
                onChangeText={t => setCodeVerif(t.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
                maxLength={6}
                textAlign="center"
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[S.btnVerif, loadingVerif && { opacity: 0.65 }]}
                  onPress={handleVerifierCode}
                  disabled={loadingVerif}
                >
                  {loadingVerif ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                      <Text style={S.btnVerifText}>VÉRIFIER</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={S.btnAnnulerVerif}
                  onPress={() => { setShowVerif(false); setCodeVerif(''); }}
                >
                  <Text style={S.btnAnnulerVerifText}>Annuler</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* ══ SÉCURITÉ ══ */}
        <View style={S.card}>
          <View style={S.cardHeader}>
            <View style={S.cardIconWrap}>
              <Ionicons name="shield-outline" size={18} color={COLORS.green} />
            </View>
            <Text style={S.cardTitle}>Sécurité</Text>
          </View>

          <TouchableOpacity
            style={S.btnOutline}
            onPress={() => navigation.navigate('ChangerMotDePasse')}
            activeOpacity={0.8}
          >
            <View style={S.btnOutlineLeft}>
              <Ionicons name="key-outline" size={20} color={COLORS.green} />
              <Text style={S.btnOutlineText}>Changer le mot de passe</Text>
            </View>
            <Ionicons name="chevron-forward-outline" size={18} color={COLORS.green} />
          </TouchableOpacity>

          <TouchableOpacity
            style={S.btnDanger}
            onPress={handleDeconnexion}
            activeOpacity={0.8}
          >
            <View style={S.btnOutlineLeft}>
              <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
              <Text style={S.btnDangerText}>Se déconnecter</Text>
            </View>
            <Ionicons name="chevron-forward-outline" size={18} color={COLORS.error} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ══ MODAL SÉLECTION PAYS ══ */}
      <Modal visible={showPaysModal} animationType="slide" transparent>
        <View style={S.modalOverlay}>
          <View style={S.modalBox}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>Choisir l'indicatif</Text>
              <TouchableOpacity onPress={() => setShowPays(false)}>
                <Ionicons name="close" size={24} color="#424242" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={PAYS}
              keyExtractor={(_, i) => i.toString()}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={[S.paysOption, paysIndex === index && S.paysOptionSel]}
                  onPress={() => {
                    setPaysIndex(index);
                    setShowPays(false);
                    setTelephone('');
                    setTelErreur('');
                  }}
                >
                  <Text style={S.paysOptionFlag}>{item.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[S.paysOptionLabel, paysIndex === index && { color: COLORS.green }]}>
                      {item.label}
                    </Text>
                    <Text style={S.paysOptionCode}>{item.code}</Text>
                  </View>
                  {paysIndex === index && (
                    <Ionicons name="checkmark-circle" size={22} color={COLORS.green} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ── Composant ligne info ──────────────────────
function InfoItem({ iconName, label, value }) {
  return (
    <View style={S.infoRow}>
      <View style={S.infoLeft}>
        <Ionicons name={iconName} size={15} color="#9E9E9E" />
        <Text style={S.infoLabel}>{label}</Text>
      </View>
      <Text style={S.infoValue}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────
const S = StyleSheet.create({
  // Header
  header: {
    backgroundColor: COLORS.green,
    paddingTop: 50, paddingBottom: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  backBtn: {
    position: 'absolute', top: 50, left: 16,
    width: 36, height: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  avatarWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  avatarText:   { fontSize: 26, fontWeight: '800', color: '#fff' },
  headerNom:    { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 4 },
  roleRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  headerRole:   { fontSize: 12, color: '#A5D6A7', letterSpacing: 0.5 },
  matriculeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  matriculeText:{ fontSize: 11, color: '#81C784' },

  // Body
  body: { padding: 14 },

  // Card
  card: {
    backgroundColor: '#fff', borderRadius: 16,
    padding: 16, marginBottom: 14,
    elevation: 3, shadowColor: '#000',
    shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, marginBottom: 14,
    paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  cardIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: COLORS.greenPale,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#212121' },

  // Info rows
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: '#FAFAFA',
  },
  infoLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoLabel: { fontSize: 13, color: '#9E9E9E' },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#212121' },

  // Téléphone actuel
  telActuelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.greenPale, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7, marginBottom: 10,
  },
  telActuelText: { fontSize: 12, color: COLORS.green, fontWeight: '600' },

  // Input téléphone
  telInputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#E0E0E0',
    borderRadius: 12, backgroundColor: '#FAFAFA',
    overflow: 'hidden', height: 52,
  },
  paysBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, gap: 5, height: '100%',
    backgroundColor: '#F5F5F5',
  },
  paysFlag: { fontSize: 20 },
  paysCode: { fontSize: 13, fontWeight: '700', color: '#424242' },
  separator: { width: 1, height: '60%', backgroundColor: '#E0E0E0' },
  telInput: {
    flex: 1, paddingHorizontal: 12,
    fontSize: 15, color: '#212121',
  },

  // Info / Erreur
  infoSmsRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 6, marginTop: 8, marginBottom: 12,
  },
  infoSmsText: { flex: 1, fontSize: 11, color: COLORS.blue, lineHeight: 16 },
  errRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 5, marginTop: 6, marginBottom: 10,
  },
  errText: { fontSize: 12, color: COLORS.error, flex: 1 },

  // Boutons
  btnSave: {
    backgroundColor: COLORS.green, borderRadius: 12,
    height: 50, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    marginBottom: 4,
    elevation: 4, shadowColor: COLORS.green,
    shadowOpacity: 0.3, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  btnSaveText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.8 },

  // Zone vérification
  verifBox: {
    backgroundColor: COLORS.greenPale, borderRadius: 12,
    padding: 14, marginTop: 12,
    borderWidth: 1, borderColor: '#A5D6A7',
  },
  verifHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  verifTitle:  { fontSize: 14, fontWeight: '700', color: COLORS.green },
  verifSub:    { fontSize: 12, color: '#558B2F', marginBottom: 12, lineHeight: 17 },
  codeInput: {
    backgroundColor: '#fff', borderWidth: 1.5,
    borderColor: '#A5D6A7', borderRadius: 12,
    height: 56, fontSize: 28, fontWeight: '800',
    color: COLORS.green, letterSpacing: 12,
    marginBottom: 12, textAlign: 'center',
  },
  btnVerif: {
    flex: 1, backgroundColor: COLORS.green,
    borderRadius: 10, height: 44,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6,
  },
  btnVerifText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  btnAnnulerVerif: {
    flex: 0.6, backgroundColor: '#fff',
    borderRadius: 10, height: 44,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#E0E0E0',
  },
  btnAnnulerVerifText: { color: '#9E9E9E', fontWeight: '600', fontSize: 13 },

  // Sécurité
  btnOutline: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: COLORS.green,
    borderRadius: 12, padding: 14, marginBottom: 10,
    backgroundColor: COLORS.greenPale,
  },
  btnOutlineLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btnOutlineText: { fontSize: 14, fontWeight: '600', color: COLORS.green },
  btnDanger: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: '#FECACA',
    borderRadius: 12, padding: 14,
    backgroundColor: '#FEF2F2',
  },
  btnDangerText: { fontSize: 14, fontWeight: '600', color: COLORS.error },

  // Modal pays
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '55%',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#212121' },
  paysOption: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, gap: 14,
    borderBottomWidth: 1, borderBottomColor: '#F9F9F9',
  },
  paysOptionSel:   { backgroundColor: COLORS.greenPale },
  paysOptionFlag:  { fontSize: 26 },
  paysOptionLabel: { fontSize: 15, fontWeight: '600', color: '#212121' },
  paysOptionCode:  { fontSize: 12, color: '#9E9E9E', marginTop: 2 },
});