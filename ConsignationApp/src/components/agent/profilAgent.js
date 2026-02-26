// src/components/agent/profilAgent.js
// ── Adapté de shared/profil.js ──
// ✅ Même structure que profilCharge.js (avatar initiales, infos, téléphone, sécurité)
// ✅ Couleurs AGENT : #2E7D32 / #1565C0 (pas #2d6a4f du chargé)
// ✅ Téléphone avec indicatif pays + vérification SMS (repris de shared/profil.js)
// ✅ Styles 100% internes (pas d'import variables.css)
// ✅ À placer dans : src/components/agent/profilAgent.js
// ✅ Supprimer : src/components/shared/profil.js (pour l'agent)

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StatusBar, ActivityIndicator, Alert, StyleSheet,
  Modal, FlatList, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../../api/client';

// ── Couleurs agent (même valeurs que variables.css, définies en interne) ──
const C = {
  green:      '#2E7D32',
  greenDark:  '#1B5E20',
  greenPale:  '#E8F5E9',
  greenLight: '#A5D6A7',
  blue:       '#1565C0',
  bluePale:   '#E3F2FD',
  gray:       '#9E9E9E',
  grayDark:   '#424242',
  error:      '#EF4444',
  bg:         '#F5F7FA',
};

// ── Pays (repris de shared/profil.js) ──────────
const PAYS = [
  { code: '+212', label: 'Maroc',        flag: '🇲🇦', placeholder: '06 XX XX XX XX' },
  { code: '+33',  label: 'France',       flag: '🇫🇷', placeholder: '06 XX XX XX XX' },
  { code: '+1',   label: 'USA / Canada', flag: '🇺🇸', placeholder: '(XXX) XXX-XXXX' },
  { code: '+44',  label: 'Royaume-Uni',  flag: '🇬🇧', placeholder: '07XXX XXXXXX'   },
];

const ROLE_LABEL = {
  agent_production: 'Agent de Production',
  chef_prod:        'Chef de Production',
  hse:              'Responsable HSE',
  electricien:      'Électricien',
  chef_electricien: 'Chef Électricien',
  chef_intervenant: 'Chef Intervenant',
  admin:            'Administrateur',
};

// ── Initiales (repris de shared/profil.js) ──────
const getInitiales = (prenom, nom) => {
  const p = prenom ? prenom.charAt(0).toUpperCase() : '';
  const n = nom    ? nom.charAt(0).toUpperCase()    : '';
  return `${p}${n}` || '??';
};

// ── Validation numéro (repris de shared/profil.js) ──
const validerNumero = (num) => {
  const clean = num.replace(/\s/g, '');
  if (!clean)           return 'Veuillez saisir un numéro de téléphone';
  if (clean.length < 8) return 'Numéro trop court (minimum 8 chiffres)';
  if (!/^\d+$/.test(clean)) return 'Le numéro ne doit contenir que des chiffres';
  return null;
};

export default function ProfilAgent({ navigation }) {
  const [user,         setUser]         = useState(null);
  const [loading,      setLoading]      = useState(true);

  // Téléphone
  const [telephone,    setTelephone]    = useState('');
  const [paysIndex,    setPaysIndex]    = useState(0);
  const [showPays,     setShowPays]     = useState(false);
  const [loadingTel,   setLoadingTel]   = useState(false);
  const [telErreur,    setTelErreur]    = useState('');
  const [showVerif,    setShowVerif]    = useState(false);
  const [codeVerif,    setCodeVerif]    = useState('');
  const [loadingVerif, setLoadingVerif] = useState(false);

  // ── Charger user ────────────────────────────
  const charger = useCallback(async () => {
    try {
      // 1. Charger depuis AsyncStorage d'abord
      const stored = await AsyncStorage.getItem('user');
      if (stored) {
        const u = JSON.parse(stored);
        setUser(u);
        _parserTelephone(u.telephone);
      }
      // 2. Rafraîchir depuis l'API
      const res = await client.get('/auth/me');
      if (res?.data?.success && res?.data?.data) {
        const u = res.data.data;
        setUser(u);
        await AsyncStorage.setItem('user', JSON.stringify(u));
        _parserTelephone(u.telephone);
      }
    } catch (e) {
      console.error('ProfilAgent charger:', e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const _parserTelephone = (tel) => {
    if (!tel) return;
    const t = tel.trim();
    const idx = PAYS.findIndex(p => t.startsWith(p.code));
    if (idx !== -1) {
      setPaysIndex(idx);
      setTelephone(t.replace(PAYS[idx].code, '').trim());
    } else {
      setTelephone(t);
    }
  };

  useEffect(() => { charger(); }, [charger]);

  // ── Enregistrer téléphone (repris de shared/profil.js) ──
  const handleSauveTelephone = async () => {
    setTelErreur('');
    const erreur = validerNumero(telephone);
    if (erreur) { setTelErreur(erreur); return; }

    setLoadingTel(true);
    try {
      const pays = PAYS[paysIndex];
      const numeroComplet = `${pays.code} ${telephone.trim()}`;
      const res = await client.put('/users/telephone', { telephone: numeroComplet });
      if (res?.data?.success) {
        setShowVerif(true);
        Alert.alert('📱 Code envoyé', `Un code de vérification a été envoyé au\n${numeroComplet}`);
      } else {
        setTelErreur(res?.data?.message || 'Erreur lors de la mise à jour');
      }
    } catch {
      setTelErreur('Erreur de connexion au serveur');
    } finally {
      setLoadingTel(false);
    }
  };

  // ── Vérifier code SMS (repris de shared/profil.js) ──
  const handleVerifierCode = async () => {
    if (codeVerif.length !== 6) {
      Alert.alert('Erreur', 'Le code doit contenir exactement 6 chiffres');
      return;
    }
    setLoadingVerif(true);
    try {
      const res = await client.post('/users/verifier-telephone', { code: codeVerif });
      if (res?.data?.success) {
        setShowVerif(false);
        setCodeVerif('');
        const pays = PAYS[paysIndex];
        const numeroComplet = `${pays.code} ${telephone.trim()}`;
        const stored = await AsyncStorage.getItem('user');
        if (stored) {
          const u = JSON.parse(stored);
          u.telephone = numeroComplet;
          await AsyncStorage.setItem('user', JSON.stringify(u));
          setUser(u);
        }
        Alert.alert('✅ Succès', 'Numéro de téléphone vérifié et enregistré !');
      } else {
        Alert.alert('❌ Code incorrect', 'Le code saisi est incorrect. Réessayez.');
      }
    } catch {
      Alert.alert('Erreur', 'Code incorrect ou expiré');
    } finally {
      setLoadingVerif(false);
    }
  };

  // ── Déconnexion ─────────────────────────────
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
            await AsyncStorage.multiRemove(['token', 'user']);
            navigation.reset({ index: 0, routes: [{ name: 'AuthStack' }] });
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator size="large" color={C.green} />
      </View>
    );
  }

  const pays = PAYS[paysIndex];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={C.greenDark} />

      {/* ── Header (style profilCharge) ── */}
      <View style={[S.header, { backgroundColor: C.green }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Mon Profil</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Avatar section (style profilCharge + initiales de shared/profil) ── */}
      <View style={[S.avatarSection, { backgroundColor: C.green }]}>
        <View style={[S.avatar, { backgroundColor: C.greenPale }]}>
          <Text style={[S.avatarTxt, { color: C.green }]}>
            {getInitiales(user?.prenom, user?.nom)}
          </Text>
        </View>
        <Text style={S.avatarNom}>{user?.prenom} {user?.nom}</Text>
        {user?.matricule && (
          <View style={S.matriculeBadge}>
            <Ionicons name="card-outline" size={11} color="rgba(255,255,255,0.8)" />
            <Text style={S.matriculeTxt}> {user.matricule}</Text>
          </View>
        )}
        <View style={S.roleBadge}>
          <Text style={S.roleBadgeTxt}>
            {(ROLE_LABEL[user?.role] || 'AGENT DE PRODUCTION').toUpperCase()}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Informations personnelles (style profilCharge) ── */}
        <Text style={S.sectionTitle}>Informations personnelles</Text>
        <View style={S.card}>
          {[
            { icon: 'person-outline',    lbl: 'Nom complet', val: `${user?.prenom || ''} ${user?.nom || ''}` },
            { icon: 'id-card-outline',   lbl: 'Matricule',   val: user?.matricule  },
            { icon: 'at-outline',        lbl: 'Username',    val: user?.username   },
            { icon: 'business-outline',  lbl: 'Entité',      val: user?.entite     },
            { icon: 'location-outline',  lbl: 'Zone',        val: user?.zone       },
            { icon: 'briefcase-outline', lbl: 'Rôle',        val: ROLE_LABEL[user?.role] || user?.role },
          ].map((r, i, arr) => (
            <View key={i} style={[
              S.infoRow,
              i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
            ]}>
              <Ionicons name={r.icon} size={14} color={C.green} />
              <Text style={S.infoLbl}>{r.lbl}</Text>
              <Text style={S.infoVal}>{r.val || '—'}</Text>
            </View>
          ))}
        </View>

        {/* ── Téléphone (repris de shared/profil.js) ── */}
        <Text style={S.sectionTitle}>Téléphone</Text>
        <View style={S.card}>
          {/* Numéro actuel */}
          {user?.telephone && (
            <View style={S.telActuelRow}>
              <Ionicons name="checkmark-circle" size={15} color={C.green} />
              <Text style={S.telActuelTxt}>Actuel : {user.telephone}</Text>
            </View>
          )}

          {/* Input indicatif + numéro */}
          <View style={[S.telInputRow, telErreur && { borderColor: C.error }]}>
            <TouchableOpacity style={S.paysBtn} onPress={() => setShowPays(true)}>
              <Text style={S.paysFlag}>{pays.flag}</Text>
              <Text style={S.paysCode}>{pays.code}</Text>
              <Ionicons name="chevron-down" size={14} color={C.gray} />
            </TouchableOpacity>
            <View style={S.paysSep} />
            <TextInput
              style={S.telInput}
              placeholder={pays.placeholder}
              placeholderTextColor="#BDBDBD"
              value={telephone}
              onChangeText={t => {
                setTelephone(t.replace(/[^0-9\s]/g, ''));
                setTelErreur('');
              }}
              keyboardType="phone-pad"
              maxLength={15}
            />
            {telephone.length > 0 && (
              <TouchableOpacity onPress={() => { setTelephone(''); setTelErreur(''); }} style={{ padding: 6 }}>
                <Ionicons name="close-circle" size={18} color="#BDBDBD" />
              </TouchableOpacity>
            )}
          </View>

          {/* Erreur ou info SMS */}
          {telErreur ? (
            <View style={S.errRow}>
              <Ionicons name="warning-outline" size={13} color={C.error} />
              <Text style={S.errTxt}>{telErreur}</Text>
            </View>
          ) : (
            <View style={S.infoSmsRow}>
              <Ionicons name="phone-portrait-outline" size={13} color={C.blue} />
              <Text style={S.infoSmsTxt}>Un SMS de vérification sera envoyé après enregistrement</Text>
            </View>
          )}

          {/* Bouton enregistrer */}
          <TouchableOpacity
            style={[S.btnSave, loadingTel && { opacity: 0.65 }]}
            onPress={handleSauveTelephone}
            disabled={loadingTel}
            activeOpacity={0.85}
          >
            {loadingTel
              ? <ActivityIndicator color="#fff" />
              : <><Ionicons name="save-outline" size={18} color="#fff" /><Text style={S.btnSaveTxt}>ENREGISTRER</Text></>
            }
          </TouchableOpacity>

          {/* Zone vérification SMS */}
          {showVerif && (
            <View style={S.verifBox}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Ionicons name="mail-unread-outline" size={18} color={C.green} />
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
                  {loadingVerif
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <><Ionicons name="checkmark-circle-outline" size={16} color="#fff" /><Text style={S.btnVerifTxt}>VÉRIFIER</Text></>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={S.btnAnnuler}
                  onPress={() => { setShowVerif(false); setCodeVerif(''); }}
                >
                  <Text style={{ color: C.gray, fontWeight: '600', fontSize: 13 }}>Annuler</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* ── Sécurité (style profilCharge) ── */}
        <Text style={S.sectionTitle}>Sécurité</Text>
        <View style={S.card}>
          <TouchableOpacity
            style={S.secRow}
            onPress={() => navigation.navigate('ChangerMotDePasse')}
          >
            <View style={[S.secIcon, { backgroundColor: C.greenPale }]}>
              <Ionicons name="lock-closed-outline" size={18} color={C.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.secLbl}>Changer le mot de passe</Text>
              <Text style={S.secSub}>Modifier votre mot de passe</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#BDBDBD" />
          </TouchableOpacity>

          <View style={{ height: 1, backgroundColor: '#F5F5F5', marginVertical: 4 }} />

          <TouchableOpacity style={S.secRow} onPress={handleDeconnexion}>
            <View style={[S.secIcon, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="log-out-outline" size={18} color={C.error} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[S.secLbl, { color: C.error }]}>Déconnexion</Text>
              <Text style={S.secSub}>Quitter votre session</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#BDBDBD" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Modal sélection pays (repris de shared/profil.js) ── */}
      <Modal visible={showPays} animationType="slide" transparent>
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
                  <Text style={{ fontSize: 26 }}>{item.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[S.paysLabel, paysIndex === index && { color: C.green }]}>{item.label}</Text>
                    <Text style={S.paysCodeOpt}>{item.code}</Text>
                  </View>
                  {paysIndex === index && <Ionicons name="checkmark-circle" size={22} color={C.green} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════
// STYLES — couleurs agent #2E7D32
// Structure identique à profilCharge.js
// ══════════════════════════════════════════════
const S = StyleSheet.create({
  // Header
  header:  { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:  { color: '#fff', fontSize: 17, fontWeight: '700' },

  // Avatar
  avatarSection:  { alignItems: 'center', paddingBottom: 28, paddingTop: 10 },
  avatar:         { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatarTxt:      { fontSize: 28, fontWeight: '900' },
  avatarNom:      { color: '#fff', fontSize: 18, fontWeight: '800' },
  matriculeBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  matriculeTxt:   { color: 'rgba(255,255,255,0.8)', fontSize: 11 },
  roleBadge:      { marginTop: 8, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  roleBadgeTxt:   { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 },

  // Section titles
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#9E9E9E', marginBottom: 8, marginTop: 12, letterSpacing: 0.5, textTransform: 'uppercase' },

  // Card
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 4,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },

  // Info rows (style profilCharge)
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  infoLbl: { fontSize: 12, color: '#9E9E9E', width: 90 },
  infoVal: { flex: 1, fontSize: 13, fontWeight: '600', color: '#212121', textAlign: 'right' },

  // Téléphone actuel
  telActuelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#E8F5E9', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7, marginBottom: 10,
  },
  telActuelTxt: { fontSize: 12, color: '#2E7D32', fontWeight: '600' },

  // Input téléphone
  telInputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#E0E0E0',
    borderRadius: 12, backgroundColor: '#FAFAFA',
    overflow: 'hidden', height: 52,
  },
  paysBtn:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 5, height: '100%', backgroundColor: '#F5F5F5' },
  paysFlag: { fontSize: 20 },
  paysCode: { fontSize: 13, fontWeight: '700', color: '#424242' },
  paysSep:  { width: 1, height: '60%', backgroundColor: '#E0E0E0' },
  telInput: { flex: 1, paddingHorizontal: 12, fontSize: 15, color: '#212121' },

  // Erreur / info SMS
  errRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, marginBottom: 10 },
  errTxt:      { fontSize: 12, color: '#EF4444', flex: 1 },
  infoSmsRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8, marginBottom: 12 },
  infoSmsTxt:  { flex: 1, fontSize: 11, color: '#1565C0', lineHeight: 16 },

  // Bouton enregistrer
  btnSave: {
    backgroundColor: '#2E7D32', borderRadius: 12, height: 50,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginBottom: 4, elevation: 4,
    shadowColor: '#2E7D32', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  btnSaveTxt: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.8 },

  // Zone vérification SMS
  verifBox:   { backgroundColor: '#E8F5E9', borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#A5D6A7' },
  verifTitle: { fontSize: 14, fontWeight: '700', color: '#2E7D32' },
  verifSub:   { fontSize: 12, color: '#558B2F', marginBottom: 12, lineHeight: 17 },
  codeInput: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#A5D6A7',
    borderRadius: 12, height: 56, fontSize: 28, fontWeight: '800',
    color: '#2E7D32', letterSpacing: 12, marginBottom: 12, textAlign: 'center',
  },
  btnVerif: {
    flex: 1, backgroundColor: '#2E7D32', borderRadius: 10, height: 44,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  btnVerifTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  btnAnnuler:  {
    flex: 0.6, backgroundColor: '#fff', borderRadius: 10, height: 44,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#E0E0E0',
  },

  // Sécurité (style profilCharge)
  secRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  secIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secLbl:  { fontSize: 13, fontWeight: '700', color: '#212121' },
  secSub:  { fontSize: 11, color: '#9E9E9E', marginTop: 2 },

  // Modal pays
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox:     { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '55%' },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  modalTitle:   { fontSize: 17, fontWeight: '700', color: '#212121' },
  paysOption:   { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14, borderBottomWidth: 1, borderBottomColor: '#F9F9F9' },
  paysOptionSel:{ backgroundColor: '#E8F5E9' },
  paysLabel:    { fontSize: 15, fontWeight: '600', color: '#212121' },
  paysCodeOpt:  { fontSize: 12, color: '#9E9E9E', marginTop: 2 },
});