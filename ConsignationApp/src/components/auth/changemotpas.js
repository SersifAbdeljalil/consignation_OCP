// src/components/auth/changemotpas.js
// ✅ FIX : bug clavier résolu avec KeyboardAvoidingView + blurOnSubmit={false}
import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, StatusBar,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../styles/variables.css';

export default function ChangerMotDePasse({ navigation }) {
  const [ancienMdp, setAncienMdp]       = useState('');
  const [nouveauMdp, setNouveauMdp]     = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading]           = useState(false);
  const [errMsg, setErrMsg]             = useState('');
  const [showAncien, setShowAncien]     = useState(false);
  const [showNouveau, setShowNouveau]   = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);

  // Refs pour naviguer entre champs sans fermer le clavier
  const refNouveau = useRef(null);
  const refConfirm = useRef(null);

  const handleChanger = async () => {
    setErrMsg('');
    if (!ancienMdp || !nouveauMdp || !confirmation) {
      setErrMsg('Tous les champs sont requis');
      return;
    }
    if (nouveauMdp.length < 6) {
      setErrMsg('Le nouveau mot de passe doit contenir au moins 6 caractères');
      return;
    }
    if (nouveauMdp !== confirmation) {
      setErrMsg('La confirmation ne correspond pas au nouveau mot de passe');
      return;
    }
    if (ancienMdp === nouveauMdp) {
      setErrMsg('Le nouveau mot de passe doit être différent de l\'ancien');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const baseUrl = await AsyncStorage.getItem('baseUrl') || 'http://192.168.1.100:3000';

      const res = await fetch(`${baseUrl}/api/users/changer-mot-de-passe`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ancien_mot_de_passe:  ancienMdp,
          nouveau_mot_de_passe: nouveauMdp,
          confirmation,
        }),
      });

      const data = await res.json();

      if (data.success) {
        Alert.alert(
          '✅ Succès',
          'Mot de passe modifié avec succès',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        setErrMsg(data.message || 'Erreur lors du changement');
      }
    } catch (e) {
      setErrMsg('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  // Indicateur de force du mot de passe
  const forceMotDePasse = () => {
    if (!nouveauMdp) return { niveau: 0, label: '', color: '' };
    if (nouveauMdp.length < 6) return { niveau: 1, label: 'Trop court', color: '#EF4444' };
    if (nouveauMdp.length < 8) return { niveau: 2, label: 'Faible', color: '#F59E0B' };
    const hasUpper = /[A-Z]/.test(nouveauMdp);
    const hasNum   = /[0-9]/.test(nouveauMdp);
    const hasSym   = /[^A-Za-z0-9]/.test(nouveauMdp);
    if (hasUpper && hasNum && hasSym) return { niveau: 4, label: 'Très fort', color: '#10B981' };
    if ((hasUpper && hasNum) || (hasNum && hasSym)) return { niveau: 3, label: 'Moyen', color: '#3B82F6' };
    return { niveau: 2, label: 'Faible', color: '#F59E0B' };
  };

  const force = forceMotDePasse();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#F5F7FA' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={COLORS.greenDark} />

      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.headerTitle}>Modifier le mot de passe</Text>
          <Text style={S.headerSub}>Sécurité du compte</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={S.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"  // ✅ FIX : clavier persiste au tap
      >
        {/* Info */}
        <View style={S.infoBox}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#3B82F6" />
          <Text style={S.infoText}>
            Utilisez au moins 6 caractères avec des lettres et chiffres pour un mot de passe sécurisé.
          </Text>
        </View>

        <View style={S.card}>
          <Text style={S.cardTitle}>🔑 Changement de mot de passe</Text>

          {/* Ancien mot de passe */}
          <View style={S.fieldGroup}>
            <Text style={S.fieldLabel}>Ancien mot de passe</Text>
            <View style={S.inputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color={COLORS.gray} style={S.icon} />
              <TextInput
                style={S.input}
                placeholder="Votre mot de passe actuel"
                placeholderTextColor="#BDBDBD"
                value={ancienMdp}
                onChangeText={t => { setAncienMdp(t); setErrMsg(''); }}
                secureTextEntry={!showAncien}
                returnKeyType="next"
                blurOnSubmit={false}                    // ✅ FIX clavier
                onSubmitEditing={() => refNouveau.current?.focus()}
              />
              <TouchableOpacity onPress={() => setShowAncien(!showAncien)} style={S.eyeBtn}>
                <Ionicons name={showAncien ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.gray} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Nouveau mot de passe */}
          <View style={S.fieldGroup}>
            <Text style={S.fieldLabel}>Nouveau mot de passe</Text>
            <View style={S.inputWrap}>
              <Ionicons name="lock-open-outline" size={18} color={COLORS.gray} style={S.icon} />
              <TextInput
                ref={refNouveau}
                style={S.input}
                placeholder="Nouveau mot de passe"
                placeholderTextColor="#BDBDBD"
                value={nouveauMdp}
                onChangeText={t => { setNouveauMdp(t); setErrMsg(''); }}
                secureTextEntry={!showNouveau}
                returnKeyType="next"
                blurOnSubmit={false}                    // ✅ FIX clavier
                onSubmitEditing={() => refConfirm.current?.focus()}
              />
              <TouchableOpacity onPress={() => setShowNouveau(!showNouveau)} style={S.eyeBtn}>
                <Ionicons name={showNouveau ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.gray} />
              </TouchableOpacity>
            </View>

            {/* Indicateur de force */}
            {nouveauMdp.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <View style={S.forceBarTrack}>
                  {[1, 2, 3, 4].map(n => (
                    <View
                      key={n}
                      style={[S.forceBarSegment, { backgroundColor: n <= force.niveau ? force.color : '#E5E7EB' }]}
                    />
                  ))}
                </View>
                <Text style={[S.forceLabel, { color: force.color }]}>{force.label}</Text>
              </View>
            )}
          </View>

          {/* Confirmation */}
          <View style={S.fieldGroup}>
            <Text style={S.fieldLabel}>Confirmer le nouveau mot de passe</Text>
            <View style={[S.inputWrap,
              confirmation.length > 0 && nouveauMdp !== confirmation && { borderColor: '#EF4444' },
              confirmation.length > 0 && nouveauMdp === confirmation && { borderColor: '#10B981' },
            ]}>
              <Ionicons name="lock-open-outline" size={18} color={COLORS.gray} style={S.icon} />
              <TextInput
                ref={refConfirm}
                style={S.input}
                placeholder="Répétez le nouveau mot de passe"
                placeholderTextColor="#BDBDBD"
                value={confirmation}
                onChangeText={t => { setConfirmation(t); setErrMsg(''); }}
                secureTextEntry={!showConfirm}
                returnKeyType="done"
                blurOnSubmit={false}                    // ✅ FIX clavier
                onSubmitEditing={handleChanger}
              />
              <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={S.eyeBtn}>
                <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.gray} />
              </TouchableOpacity>
            </View>
            {/* Indicateur correspondance */}
            {confirmation.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 5 }}>
                <Ionicons
                  name={nouveauMdp === confirmation ? 'checkmark-circle' : 'close-circle'}
                  size={14}
                  color={nouveauMdp === confirmation ? '#10B981' : '#EF4444'}
                />
                <Text style={{ fontSize: 11, color: nouveauMdp === confirmation ? '#10B981' : '#EF4444' }}>
                  {nouveauMdp === confirmation ? 'Les mots de passe correspondent' : 'Ne correspondent pas'}
                </Text>
              </View>
            )}
          </View>

          {/* Message erreur */}
          {errMsg ? (
            <View style={S.errBox}>
              <Ionicons name="warning-outline" size={16} color="#EF4444" />
              <Text style={S.errText}>{errMsg}</Text>
            </View>
          ) : null}

          {/* Bouton */}
          <TouchableOpacity
            style={[S.btn, loading && { opacity: 0.65 }]}
            onPress={handleChanger}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={S.btnText}>MODIFIER LE MOT DE PASSE</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Annuler */}
          <TouchableOpacity style={S.btnCancel} onPress={() => navigation.goBack()}>
            <Text style={S.btnCancelText}>Annuler</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const S = StyleSheet.create({
  header: { backgroundColor: COLORS.green, paddingTop: 50, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerSub: { color: '#A5D6A7', fontSize: 10, letterSpacing: 0.5 },
  body: { padding: 16 },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: '#3B82F6', gap: 10 },
  infoText: { flex: 1, fontSize: 13, color: '#1D4ED8', lineHeight: 19 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, elevation: 4, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 3 } },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#212121', marginBottom: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#424242', marginBottom: 7 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 12, backgroundColor: '#FAFAFA', paddingHorizontal: 12, height: 52 },
  icon: { marginRight: 8 },
  input: { flex: 1, fontSize: 15, color: '#212121' },
  eyeBtn: { padding: 4 },
  forceBarTrack: { flexDirection: 'row', gap: 4 },
  forceBarSegment: { flex: 1, height: 4, borderRadius: 2 },
  forceLabel: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  errBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: '#EF4444', gap: 8 },
  errText: { color: '#EF4444', fontSize: 13, flex: 1 },
  btn: { backgroundColor: COLORS.green, borderRadius: 14, height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8, elevation: 5, shadowColor: COLORS.green, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  btnCancel: { alignItems: 'center', marginTop: 14 },
  btnCancelText: { color: '#9E9E9E', fontSize: 13 },
});