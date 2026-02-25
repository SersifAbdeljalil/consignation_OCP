// src/components/charge/profilCharge.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StatusBar, ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMe, updateTelephone, verifierOtp } from '../../api/auth.api';

const CFG = {
  couleur:     '#2d6a4f',
  couleurDark: '#1b4332',
  bg:          '#b0f2b6',
  bgPale:      '#d8f3dc',
};

export default function ProfilCharge({ navigation }) {
  const [user, setUser]           = useState(null);
  const [loading, setLoading]     = useState(true);

  // Téléphone
  const [editPhone, setEditPhone]   = useState(false);
  const [newPhone, setNewPhone]     = useState('');
  const [otpSent, setOtpSent]       = useState(false);
  const [otp, setOtp]               = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  const charger = useCallback(async () => {
    try {
      const res = await getMe();
      if (res?.success && res?.data) {
        setUser(res.data);
        await AsyncStorage.setItem('user', JSON.stringify(res.data));
      } else {
        const stored = await AsyncStorage.getItem('user');
        if (stored) setUser(JSON.parse(stored));
      }
    } catch {
      const stored = await AsyncStorage.getItem('user');
      if (stored) setUser(JSON.parse(stored));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const handleEnvoyerOtp = async () => {
    if (!newPhone || newPhone.length < 10) {
      Alert.alert('Erreur', 'Numéro invalide');
      return;
    }
    setSavingPhone(true);
    try {
      const res = await updateTelephone({ telephone: newPhone });
      if (res?.success) {
        setOtpSent(true);
        Alert.alert('SMS envoyé', `Code de vérification envoyé au ${newPhone}`);
      } else {
        Alert.alert('Erreur', res?.message || 'Impossible d\'envoyer le code');
      }
    } catch {
      Alert.alert('Erreur', 'Erreur de connexion');
    } finally {
      setSavingPhone(false);
    }
  };

  const handleVerifierOtp = async () => {
    if (!otp || otp.length < 4) {
      Alert.alert('Erreur', 'Entrez le code reçu par SMS');
      return;
    }
    setSavingPhone(true);
    try {
      const res = await verifierOtp({ otp, telephone: newPhone });
      if (res?.success) {
        setUser(prev => ({ ...prev, telephone: newPhone }));
        setEditPhone(false);
        setOtpSent(false);
        setOtp('');
        setNewPhone('');
        Alert.alert('✅ Succès', 'Numéro mis à jour avec succès');
      } else {
        Alert.alert('Erreur', res?.message || 'Code incorrect');
      }
    } catch {
      Alert.alert('Erreur', 'Erreur de connexion');
    } finally {
      setSavingPhone(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Déconnexion',
      'Voulez-vous vous déconnecter ?',
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' }}>
        <ActivityIndicator size="large" color={CFG.couleur} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />

      {/* Header */}
      <View style={[S.header, { backgroundColor: CFG.couleur }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Mon Profil</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Avatar */}
      <View style={[S.avatarSection, { backgroundColor: CFG.couleur }]}>
        <View style={[S.avatar, { backgroundColor: CFG.bgPale }]}>
          <Text style={[S.avatarTxt, { color: CFG.couleur }]}>
            {user?.prenom?.[0]}{user?.nom?.[0]}
          </Text>
        </View>
        <Text style={S.avatarNom}>{user?.prenom} {user?.nom}</Text>
        <View style={S.roleBadge}>
          <Text style={S.roleBadgeTxt}>CHARGÉ DE CONSIGNATION</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* Informations personnelles */}
        <Text style={S.sectionTitle}>Informations personnelles</Text>
        <View style={S.card}>
          {[
            { icon: 'person-outline',        lbl: 'Nom complet',  val: `${user?.prenom} ${user?.nom}` },
            { icon: 'id-card-outline',       lbl: 'Matricule',    val: user?.matricule                },
            { icon: 'at-outline',            lbl: 'Username',     val: user?.username                 },
            { icon: 'business-outline',      lbl: 'Entité',       val: user?.entite                   },
            { icon: 'location-outline',      lbl: 'Zone',         val: user?.zone                     },
            { icon: 'card-outline',          lbl: 'Badge OCP',    val: user?.badge_ocp_id             },
          ].map((r, i) => (
            <View key={i} style={[S.infoRow, i < 5 && { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' }]}>
              <Ionicons name={r.icon} size={14} color={CFG.couleur} />
              <Text style={S.infoLbl}>{r.lbl}</Text>
              <Text style={S.infoVal}>{r.val || '—'}</Text>
            </View>
          ))}
        </View>

        {/* Téléphone */}
        <Text style={S.sectionTitle}>Téléphone</Text>
        <View style={S.card}>
          <View style={S.infoRow}>
            <Ionicons name="call-outline" size={14} color={CFG.couleur} />
            <Text style={S.infoLbl}>Numéro actuel</Text>
            <Text style={S.infoVal}>{user?.telephone || 'Non défini'}</Text>
          </View>

          {!editPhone ? (
            <TouchableOpacity
              style={[S.editBtn, { borderColor: CFG.couleur }]}
              onPress={() => setEditPhone(true)}
            >
              <Ionicons name="create-outline" size={16} color={CFG.couleur} />
              <Text style={[S.editBtnTxt, { color: CFG.couleur }]}>Modifier le numéro</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ marginTop: 12, gap: 10 }}>
              <TextInput
                style={[S.input, { borderColor: CFG.couleur }]}
                placeholder="+212 6XX XXX XXX"
                value={newPhone}
                onChangeText={setNewPhone}
                keyboardType="phone-pad"
                editable={!otpSent}
              />
              {!otpSent ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[S.btnSm, { backgroundColor: CFG.couleur, flex: 1 }, savingPhone && { opacity: 0.65 }]}
                    onPress={handleEnvoyerOtp}
                    disabled={savingPhone}
                  >
                    {savingPhone
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={S.btnSmTxt}>Envoyer le code SMS</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[S.btnSm, { backgroundColor: '#E0E0E0', paddingHorizontal: 12 }]}
                    onPress={() => { setEditPhone(false); setNewPhone(''); }}
                  >
                    <Text style={[S.btnSmTxt, { color: '#9E9E9E' }]}>Annuler</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <TextInput
                    style={[S.input, { borderColor: CFG.couleur, letterSpacing: 8, textAlign: 'center' }]}
                    placeholder="Code OTP"
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                  <TouchableOpacity
                    style={[S.btnSm, { backgroundColor: CFG.couleur }, savingPhone && { opacity: 0.65 }]}
                    onPress={handleVerifierOtp}
                    disabled={savingPhone}
                  >
                    {savingPhone
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={S.btnSmTxt}>Vérifier et enregistrer</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setOtpSent(false); setOtp(''); }}
                  >
                    <Text style={{ color: '#9E9E9E', fontSize: 12, textAlign: 'center' }}>
                      Renvoyer le code
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>

        {/* Sécurité */}
        <Text style={S.sectionTitle}>Sécurité</Text>
        <View style={S.card}>
          <TouchableOpacity
            style={S.securityRow}
            onPress={() => navigation.navigate('ChangerMotDePasse')}
          >
            <View style={[S.securityIcon, { backgroundColor: CFG.bgPale }]}>
              <Ionicons name="lock-closed-outline" size={18} color={CFG.couleur} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.securityLbl}>Changer le mot de passe</Text>
              <Text style={S.securitySub}>Modifier votre mot de passe</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#BDBDBD" />
          </TouchableOpacity>

          <View style={{ height: 1, backgroundColor: '#F5F5F5', marginVertical: 4 }} />

          <TouchableOpacity style={S.securityRow} onPress={handleLogout}>
            <View style={[S.securityIcon, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="log-out-outline" size={18} color="#EF4444" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[S.securityLbl, { color: '#EF4444' }]}>Déconnexion</Text>
              <Text style={S.securitySub}>Quitter votre session</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#BDBDBD" />
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  header:    { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn:   { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:    { color: '#fff', fontSize: 17, fontWeight: '700' },

  avatarSection: { alignItems: 'center', paddingBottom: 28, paddingTop: 10 },
  avatar:        { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatarTxt:     { fontSize: 28, fontWeight: '900' },
  avatarNom:     { color: '#fff', fontSize: 18, fontWeight: '800' },
  roleBadge:     { marginTop: 6, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  roleBadgeTxt:  { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 },

  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#9E9E9E', marginBottom: 8, marginTop: 12, letterSpacing: 0.5, textTransform: 'uppercase' },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 4,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  infoLbl: { fontSize: 12, color: '#9E9E9E', width: 90 },
  infoVal: { flex: 1, fontSize: 13, fontWeight: '600', color: '#212121', textAlign: 'right' },

  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, padding: 10, borderRadius: 10, borderWidth: 1.5 },
  editBtnTxt: { fontSize: 13, fontWeight: '700' },

  input: { borderWidth: 1.5, borderRadius: 10, padding: 12, fontSize: 14, color: '#212121', backgroundColor: '#FAFAFA' },

  btnSm:    { borderRadius: 10, padding: 12, alignItems: 'center', justifyContent: 'center' },
  btnSmTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

  securityRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  securityIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  securityLbl:  { fontSize: 13, fontWeight: '700', color: '#212121' },
  securitySub:  { fontSize: 11, color: '#9E9E9E', marginTop: 2 },
});