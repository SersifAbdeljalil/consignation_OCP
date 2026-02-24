import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StatusBar, ActivityIndicator,
  Alert, Modal, FlatList, Animated,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../styles/variables.css';
import { creerDemande, getLots, getEquipementsParLot } from '../../api/demande.api';

const TYPES = [
  { key: 'genie_civil', label: 'Génie Civil',         icon: 'business-outline', color: '#E65100', bg: '#FFF3E0' },
  { key: 'mecanique',   label: 'Travaux Mécaniques',  icon: 'build-outline',    color: '#1565C0', bg: '#E3F2FD' },
  { key: 'electrique',  label: 'Travaux Électriques', icon: 'flash-outline',    color: '#F9A825', bg: '#FFFDE7' },
  { key: 'process',     label: 'Process',              icon: 'settings-outline', color: '#2E7D32', bg: '#E8F5E9' },
];

const ETAPES_LABELS = ['LOT & TAG', 'Intervenants', 'Raison'];

export default function NouvelleDemande({ navigation }) {
  const [etape, setEtape]               = useState(0);
  const [lots, setLots]                 = useState([]);
  const [lotSel, setLotSel]             = useState(null);
  const [equipements, setEquipements]   = useState([]);
  const [equipSel, setEquipSel]         = useState(null);
  const [search, setSearch]             = useState('');
  const [typesSel, setTypesSel]         = useState([]);
  const [raison, setRaison]             = useState('');
  const [loading, setLoading]           = useState(false);
  const [loadingLots, setLoadingLots]   = useState(true);
  const [loadingEq, setLoadingEq]       = useState(false);
  const [showModal, setShowModal]       = useState(false);
  const [showLotModal, setShowLotModal] = useState(false);
  const [errMsg, setErrMsg]             = useState('');
  const progressAnim                    = useRef(new Animated.Value(33)).current;

  // Charger la progress bar
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: ((etape + 1) / 3) * 100,
      duration: 300, useNativeDriver: false,
    }).start();
  }, [etape]);

  // Charger les lots
  useEffect(() => {
    getLots()
      .then(r => { if (r.success) setLots(r.data); })
      .catch(console.error)
      .finally(() => setLoadingLots(false));
  }, []);

  // Charger équipements quand LOT change
  useEffect(() => {
    if (!lotSel) { setEquipements([]); setEquipSel(null); return; }
    setLoadingEq(true);
    setEquipSel(null);
    setEquipements([]);
    getEquipementsParLot(lotSel.id)
      .then(r => { if (r.success) setEquipements(r.data); })
      .catch(console.error)
      .finally(() => setLoadingEq(false));
  }, [lotSel]);

  const equipsFiltres = equipements.filter(e =>
    e.nom.toLowerCase().includes(search.toLowerCase()) ||
    e.code_equipement.toLowerCase().includes(search.toLowerCase())
  );

  const toggleType = (key) => {
    setTypesSel(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key]);
    setErrMsg('');
  };

  const suivant = () => {
    setErrMsg('');
    if (etape === 0) {
      if (!lotSel)    return setErrMsg('Sélectionnez un LOT');
      if (!equipSel)  return setErrMsg('Sélectionnez un équipement (TAG)');
      setEtape(1);
    } else if (etape === 1) {
      if (!typesSel.length) return setErrMsg('Sélectionnez au moins un type d\'intervenant');
      setEtape(2);
    } else {
      soumettre();
    }
  };

  const soumettre = async () => {
    if (!raison.trim()) return setErrMsg('La raison de l\'intervention est requise');
    setLoading(true);
    try {
      const res = await creerDemande({
        equipement_id:      equipSel.id,
        lot_id:             lotSel.id,
        raison:             raison.trim(),
        types_intervenants: typesSel,
      });
      if (res.success) {
        Alert.alert(
          '✅ Demande soumise !',
          `N° ${res.data.numero_ordre}\nLOT : ${lotSel.code}\nTAG : ${equipSel.code_equipement}`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        setErrMsg(res.message || 'Erreur lors de la soumission');
      }
    } catch {
      setErrMsg('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#F5F7FA' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={COLORS.greenDark} />

      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn}
          onPress={() => etape === 0 ? navigation.goBack() : setEtape(etape - 1)}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.headerTitle}>Nouvelle Demande</Text>
          <Text style={S.headerSub}>Consignation OCP</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Stepper */}
      <View style={S.stepperWrap}>
        {ETAPES_LABELS.map((label, i) => (
          <React.Fragment key={i}>
            <View style={S.stepItem}>
              <View style={[S.stepCircle, i <= etape && S.stepCircleActive, i < etape && S.stepCircleDone]}>
                {i < etape
                  ? <Ionicons name="checkmark" size={13} color="#fff" />
                  : <Text style={[S.stepNum, i === etape && { color: '#fff' }]}>{i + 1}</Text>
                }
              </View>
              <Text style={[S.stepLabel, i === etape && S.stepLabelActive]}>{label}</Text>
            </View>
            {i < 2 && <View style={[S.stepConnector, i < etape && S.stepConnectorDone]} />}
          </React.Fragment>
        ))}
      </View>

      <View style={S.progressTrack}>
        <Animated.View style={[S.progressFill, {
          width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
        }]} />
      </View>

      <ScrollView
        contentContainerStyle={S.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={S.card}>

          {/* Titre étape */}
          <View style={S.etapeTitleRow}>
            <View style={S.etapeBadge}>
              <Text style={S.etapeBadgeText}>{etape + 1}/3</Text>
            </View>
            <Text style={S.etapeTitle}>
              {['🏷️  LOT & Équipement (TAG)', '👷  Types d\'intervenants', '📝  Raison de l\'intervention'][etape]}
            </Text>
          </View>

          {/* ══ ÉTAPE 0 : LOT + TAG ══ */}
          {etape === 0 && (
            <>
              {/* Sélection LOT */}
              <View style={S.field}>
                <Text style={S.fieldLabel}><Text style={S.req}>* </Text>LOT</Text>
                <TouchableOpacity
                  style={[S.inputRow, S.selectBtn]}
                  onPress={() => setShowLotModal(true)}
                >
                  <Ionicons name="layers-outline" size={18}
                    color={lotSel ? COLORS.green : COLORS.gray} style={S.inputIcon} />
                  {loadingLots
                    ? <ActivityIndicator size="small" color={COLORS.green} />
                    : <Text style={lotSel ? S.selectTextActive : S.selectTextPlaceholder} numberOfLines={1}>
                        {lotSel ? `${lotSel.code}` : 'Sélectionner un LOT...'}
                      </Text>
                  }
                  <Ionicons name="chevron-down-outline" size={16} color={COLORS.gray} />
                </TouchableOpacity>

                {lotSel && (
                  <View style={S.equipBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={COLORS.green} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={S.equipBadgeNom}>{lotSel.code}</Text>
                      <Text style={S.equipBadgeLoc}>{lotSel.description}</Text>
                    </View>
                    <TouchableOpacity onPress={() => { setLotSel(null); setEquipSel(null); setErrMsg(''); }}>
                      <Ionicons name="close-circle-outline" size={18} color={COLORS.gray} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Sélection TAG */}
              <View style={S.field}>
                <Text style={S.fieldLabel}><Text style={S.req}>* </Text>TAG — Équipement à consigner</Text>
                <TouchableOpacity
                  style={[S.inputRow, S.selectBtn, !lotSel && S.inputDisabled]}
                  onPress={() => lotSel && setShowModal(true)}
                  disabled={!lotSel}
                >
                  <Ionicons name="hardware-chip-outline" size={18}
                    color={equipSel ? COLORS.green : COLORS.gray} style={S.inputIcon} />
                  {loadingEq
                    ? <ActivityIndicator size="small" color={COLORS.green} />
                    : <Text style={equipSel ? S.selectTextActive : S.selectTextPlaceholder} numberOfLines={1}>
                        {!lotSel
                          ? 'Sélectionnez d\'abord un LOT'
                          : equipSel
                            ? `${equipSel.code_equipement} — ${equipSel.nom}`
                            : 'Sélectionner un équipement...'}
                      </Text>
                  }
                  <Ionicons name="search-outline" size={16} color={COLORS.gray} />
                </TouchableOpacity>

                {equipSel && (
                  <View style={S.equipBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={COLORS.green} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={S.equipBadgeNom}>{equipSel.nom}</Text>
                      <Text style={S.equipBadgeLoc}>{equipSel.localisation}</Text>
                    </View>
                    <TouchableOpacity onPress={() => { setEquipSel(null); setErrMsg(''); }}>
                      <Ionicons name="close-circle-outline" size={18} color={COLORS.gray} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Info si aucun équipement dans ce lot */}
              {lotSel && !loadingEq && equipements.length === 0 && (
                <View style={S.infoBox}>
                  <Ionicons name="information-circle-outline" size={16} color="#3B82F6" />
                  <Text style={S.infoText}>Aucun équipement disponible pour ce LOT</Text>
                </View>
              )}
            </>
          )}

          {/* ══ ÉTAPE 1 : Types intervenants ══ */}
          {etape === 1 && (
            <>
              <Text style={S.etapeDesc}>
                Cochez les corps de métier qui vont intervenir sur cet équipement
              </Text>
              {TYPES.map(t => {
                const sel = typesSel.includes(t.key);
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[S.typeCard, sel && { borderColor: t.color, backgroundColor: t.bg }]}
                    onPress={() => toggleType(t.key)}
                    activeOpacity={0.8}
                  >
                    <View style={[S.typeIcon, { backgroundColor: sel ? t.color : '#EEEEEE' }]}>
                      <Ionicons name={t.icon} size={20} color={sel ? '#fff' : '#757575'} />
                    </View>
                    <Text style={[S.typeLabel, sel && { color: t.color, fontWeight: '700' }]}>
                      {t.label}
                    </Text>
                    <View style={[S.checkbox, sel && { backgroundColor: t.color, borderColor: t.color }]}>
                      {sel && <Ionicons name="checkmark" size={13} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
              {typesSel.length > 0 && (
                <View style={S.selBadge}>
                  <Ionicons name="people-outline" size={13} color={COLORS.green} />
                  <Text style={S.selBadgeText}>
                    {typesSel.length} type{typesSel.length > 1 ? 's' : ''} sélectionné{typesSel.length > 1 ? 's' : ''}
                  </Text>
                </View>
              )}
            </>
          )}

          {/* ══ ÉTAPE 2 : Raison ══ */}
          {etape === 2 && (
            <>
              <View style={S.recap}>
                <Text style={S.recapTitle}>📋 Récapitulatif</Text>
                <View style={S.recapRow}>
                  <Text style={S.recapLbl}>LOT</Text>
                  <Text style={S.recapVal}>{lotSel?.code}</Text>
                </View>
                <View style={S.recapRow}>
                  <Text style={S.recapLbl}>TAG</Text>
                  <Text style={S.recapVal}>{equipSel?.code_equipement}</Text>
                </View>
                <View style={S.recapRow}>
                  <Text style={S.recapLbl}>Équipement</Text>
                  <Text style={S.recapVal} numberOfLines={1}>{equipSel?.nom}</Text>
                </View>
                <View style={S.recapRow}>
                  <Text style={S.recapLbl}>Intervenants</Text>
                  <Text style={[S.recapVal, { flex: 1, textAlign: 'right' }]} numberOfLines={2}>
                    {typesSel.map(k => TYPES.find(t => t.key === k)?.label).join(', ')}
                  </Text>
                </View>
              </View>

              <View style={S.field}>
                <Text style={S.fieldLabel}><Text style={S.req}>* </Text>Raison de l'intervention</Text>
                <TextInput
                  style={S.textarea}
                  placeholder="Décrivez précisément la raison de l'intervention..."
                  placeholderTextColor="#BDBDBD"
                  value={raison}
                  onChangeText={t => { setRaison(t); setErrMsg(''); }}
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                  blurOnSubmit={false}
                  returnKeyType="default"
                />
                <Text style={S.charCount}>{raison.length} caractères</Text>
              </View>
            </>
          )}

          {/* Erreur */}
          {errMsg ? (
            <View style={S.errBox}>
              <Ionicons name="warning-outline" size={16} color={COLORS.error} />
              <Text style={S.errText}>{errMsg}</Text>
            </View>
          ) : null}

          {/* Bouton Suivant */}
          <TouchableOpacity
            style={[S.btnNext, loading && { opacity: 0.65 }]}
            onPress={suivant}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Text style={S.btnNextText}>
                  {etape < 2 ? 'SUIVANT' : 'SOUMETTRE LA DEMANDE'}
                </Text>
                <Ionicons name={etape < 2 ? 'arrow-forward' : 'send-outline'} size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>

          {etape > 0 && (
            <TouchableOpacity style={S.btnBack} onPress={() => setEtape(etape - 1)}>
              <Ionicons name="arrow-back-outline" size={16} color={COLORS.gray} />
              <Text style={S.btnBackText}>Retour</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ══ Modal sélection LOT ══ */}
      <Modal visible={showLotModal} animationType="slide" transparent>
        <View style={S.modalOverlay}>
          <View style={[S.modalBox, { maxHeight: '50%' }]}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>Sélectionner le LOT</Text>
              <TouchableOpacity onPress={() => setShowLotModal(false)}>
                <Ionicons name="close" size={24} color="#424242" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={lots}
              keyExtractor={item => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[S.eqRow, lotSel?.id === item.id && S.eqRowSel]}
                  onPress={() => {
                    setLotSel(item);
                    setShowLotModal(false);
                    setErrMsg('');
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={S.eqCode}>{item.code}</Text>
                    <Text style={S.eqNom}>{item.description}</Text>
                  </View>
                  {lotSel?.id === item.id && (
                    <Ionicons name="checkmark-circle" size={22} color={COLORS.green} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ══ Modal sélection TAG ══ */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={S.modalOverlay}>
          <View style={S.modalBox}>
            <View style={S.modalHeader}>
              <View>
                <Text style={S.modalTitle}>Sélectionner le TAG</Text>
                {lotSel && <Text style={{ fontSize: 12, color: COLORS.green, marginTop: 2 }}>LOT : {lotSel.code}</Text>}
              </View>
              <TouchableOpacity onPress={() => { setShowModal(false); setSearch(''); }}>
                <Ionicons name="close" size={24} color="#424242" />
              </TouchableOpacity>
            </View>

            <View style={S.searchRow}>
              <Ionicons name="search-outline" size={18} color={COLORS.gray} style={{ marginRight: 8 }} />
              <TextInput
                style={{ flex: 1, fontSize: 15, color: '#212121' }}
                placeholder="Rechercher par nom ou code..."
                placeholderTextColor="#BDBDBD"
                value={search}
                onChangeText={setSearch}
                autoFocus
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={18} color={COLORS.gray} />
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={equipsFiltres}
              keyExtractor={item => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[S.eqRow, equipSel?.id === item.id && S.eqRowSel]}
                  onPress={() => { setEquipSel(item); setShowModal(false); setSearch(''); setErrMsg(''); }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={S.eqCode}>{item.code_equipement}</Text>
                    <Text style={S.eqNom}>{item.nom}</Text>
                    <Text style={S.eqLoc}>{item.localisation}</Text>
                  </View>
                  {equipSel?.id === item.id && (
                    <Ionicons name="checkmark-circle" size={22} color={COLORS.green} />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', padding: 30 }}>
                  <Ionicons name="search-outline" size={40} color="#BDBDBD" />
                  <Text style={{ color: '#9E9E9E', marginTop: 10 }}>Aucun équipement trouvé</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const S = StyleSheet.create({
  header: { backgroundColor: COLORS.green, paddingTop: 50, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub: { color: '#A5D6A7', fontSize: 10, letterSpacing: 1 },
  stepperWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 12 },
  stepItem: { alignItems: 'center', flex: 0 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EEEEEE', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#E0E0E0' },
  stepCircleActive: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  stepCircleDone: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  stepNum: { fontSize: 11, fontWeight: '700', color: '#9E9E9E' },
  stepLabel: { fontSize: 9, color: '#9E9E9E', marginTop: 3, width: 55, textAlign: 'center' },
  stepLabelActive: { color: COLORS.green, fontWeight: '700' },
  stepConnector: { flex: 1, height: 2, backgroundColor: '#E0E0E0', marginBottom: 12 },
  stepConnectorDone: { backgroundColor: COLORS.green },
  progressTrack: { height: 3, backgroundColor: '#E0E0E0' },
  progressFill: { height: '100%', backgroundColor: COLORS.green },
  body: { padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, elevation: 4, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 3 } },
  etapeTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  etapeBadge: { backgroundColor: '#E8F5E9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginRight: 10 },
  etapeBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.green },
  etapeTitle: { fontSize: 15, fontWeight: '700', color: '#212121', flex: 1 },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#424242', marginBottom: 6 },
  req: { color: '#EF4444' },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 12, backgroundColor: '#FAFAFA', paddingHorizontal: 12, height: 50 },
  inputDisabled: { backgroundColor: '#F5F5F5', opacity: 0.7 },
  inputIcon: { marginRight: 8 },
  selectBtn: { justifyContent: 'space-between' },
  selectTextPlaceholder: { flex: 1, fontSize: 14, color: '#BDBDBD' },
  selectTextActive: { flex: 1, fontSize: 14, color: '#212121', fontWeight: '600' },
  equipBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: '#A5D6A7' },
  equipBadgeNom: { fontSize: 13, fontWeight: '700', color: COLORS.green },
  equipBadgeLoc: { fontSize: 11, color: '#757575', marginTop: 2 },
  infoBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: 10, padding: 12, marginTop: 8, gap: 8 },
  infoText: { flex: 1, fontSize: 13, color: '#1D4ED8' },
  etapeDesc: { fontSize: 13, color: '#757575', marginBottom: 14, lineHeight: 19 },
  typeCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: '#E0E0E0', borderRadius: 14, padding: 14, marginBottom: 10, backgroundColor: '#fff', gap: 12 },
  typeIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  typeLabel: { flex: 1, fontSize: 15, color: '#212121' },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#E0E0E0', alignItems: 'center', justifyContent: 'center' },
  selBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', borderRadius: 8, padding: 8, gap: 6, marginTop: 4 },
  selBadgeText: { fontSize: 12, color: COLORS.green, fontWeight: '600' },
  recap: { backgroundColor: '#FAFAFA', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#EEEEEE' },
  recapTitle: { fontSize: 13, fontWeight: '700', color: '#212121', marginBottom: 10 },
  recapRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  recapLbl: { fontSize: 12, color: '#9E9E9E', width: 80 },
  recapVal: { fontSize: 12, fontWeight: '600', color: '#212121' },
  textarea: { borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 12, backgroundColor: '#FAFAFA', paddingHorizontal: 14, paddingVertical: 12, minHeight: 130, fontSize: 15, color: '#212121', textAlignVertical: 'top' },
  charCount: { fontSize: 10, color: '#BDBDBD', textAlign: 'right', marginTop: 4 },
  errBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFEBEE', borderRadius: 10, padding: 12, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#EF4444', gap: 8 },
  errText: { color: '#EF4444', fontSize: 13, flex: 1 },
  btnNext: { backgroundColor: COLORS.green, borderRadius: 14, height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8, elevation: 5, shadowColor: COLORS.green, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  btnNextText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 1 },
  btnBack: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, gap: 6 },
  btnBackText: { color: '#9E9E9E', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '82%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', justifyContent: 'space-between' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#212121' },
  searchRow: { flexDirection: 'row', alignItems: 'center', margin: 14, borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 12, paddingHorizontal: 12, height: 48, backgroundColor: '#FAFAFA' },
  eqRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#F9F9F9' },
  eqRowSel: { backgroundColor: '#E8F5E9' },
  eqCode: { fontSize: 11, fontWeight: '800', color: COLORS.green, letterSpacing: 0.5 },
  eqNom: { fontSize: 15, fontWeight: '600', color: '#212121', marginTop: 2 },
  eqLoc: { fontSize: 12, color: '#9E9E9E', marginTop: 2 },
});