// src/components/chefIntervenant/detailConsignation.js
// ✅ FIX : 3 nouveaux statuts déconsignés ajoutés dans STATUT_LABELS
// ✅ FIX : isConsigne / isDeconsigne séparés → bon bouton affiché
// ✅ FIX : navigation avec ID minimal si demande non trouvée dans la liste
// ✅ FIX : bannière rapport visible pour tous les statuts déconsignés

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StatusBar, ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getEquipe,
  getStatutDeconsignation,
  marquerEntreeMembre,
} from '../../api/equipeIntervention.api';

const CFG = { couleur: '#1565C0', bg: '#E3F2FD' };

const STATUT_LABELS = {
  en_attente:           { color: '#F59E0B', label: 'En attente'        },
  validee:              { color: '#10B981', label: 'Validée'           },
  rejetee:              { color: '#EF4444', label: 'Rejetée'           },
  en_cours:             { color: '#3B82F6', label: 'En cours'          },
  consigne:             { color: '#2E7D32', label: 'Consignée'         },
  consigne_charge:      { color: '#1565C0', label: 'Consignée Chargé'  },
  consigne_process:     { color: '#6A1B9A', label: 'Consignée Process' },
  // ✅ Nouveaux statuts déconsignés
  deconsigne_intervent: { color: '#6A1B9A', label: 'Déconsig. Interv.' },
  deconsigne_charge:    { color: '#0277BD', label: 'Déconsig. Chargé'  },
  deconsigne_process:   { color: '#558B2F', label: 'Déconsig. Process' },
  deconsignee:          { color: '#8B5CF6', label: 'Déconsignée'       },
  cloturee:             { color: '#6B7280', label: 'Clôturée'          },
};

// ✅ Statuts où l'équipe est encore active (intervention en cours)
const STATUTS_CONSIGNE_ACTIF = ['consigne', 'consigne_charge', 'consigne_process'];

// ✅ Statuts où l'intervention est terminée (rapport disponible)
const STATUTS_DECONSIGNE = [
  'deconsigne_intervent', 'deconsigne_charge', 'deconsigne_process', 'deconsignee',
];

const fmtHeure = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return `${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`;
};
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()}`;
};

const getMembreStatut = (m) => {
  if (m.statut === 'sortie')   return 'termine';
  if (m.statut === 'sur_site') return 'sur_site';
  return 'en_attente';
};

export default function DetailConsignation({ navigation, route }) {
  const { demande }                       = route.params;
  const [membres, setMembres]             = useState([]);
  const [equipeValidee, setEquipeValidee] = useState(false);
  const [statut, setStatut]               = useState(null);
  const [loading, setLoading]             = useState(true);
  const [updatingIds, setUpdatingIds]     = useState([]);
  const [updatingTous, setUpdatingTous]   = useState(false);

  const charger = useCallback(async () => {
    try {
      setLoading(true);
      const [resEquipe, resStatut] = await Promise.all([
        getEquipe(demande.id),
        getStatutDeconsignation(demande.id),
      ]);
      if (resEquipe?.success) {
        setMembres(resEquipe.data.membres || []);
        setEquipeValidee(resEquipe.data.equipe_validee === 1);
      }
      if (resStatut?.success) {
        setStatut(resStatut.data);
      }
    } catch (e) {
      // ✅ Ignorer les 400/404 (demande pas encore consignée ou hors périmètre)
      if (e?.response?.status !== 400 && e?.response?.status !== 404) {
        console.error('DetailConsignation charger error:', e?.message || e);
      }
      setMembres([]);
      setEquipeValidee(false);
    } finally {
      setLoading(false);
    }
  }, [demande.id]);

  useEffect(() => { charger(); }, [charger]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', charger);
    return unsub;
  }, [navigation, charger]);

  // ── Marquer un seul membre Sur site ──────────────────────────────
  const handleMarquerEntree = async (membre) => {
    if (updatingIds.includes(membre.id)) return;
    Alert.alert('Confirmer', `Marquer ${membre.nom} comme "Sur site" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Confirmer',
        onPress: async () => {
          try {
            setUpdatingIds(p => [...p, membre.id]);
            const res = await marquerEntreeMembre(membre.id);
            if (res?.success) {
              setMembres(p => p.map(m =>
                m.id === membre.id
                  ? { ...m, statut: 'sur_site', heure_entree: new Date().toISOString() }
                  : m
              ));
            } else Alert.alert('Erreur', res?.message || 'Impossible de mettre à jour.');
          } catch (e) {
            Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
          } finally {
            setUpdatingIds(p => p.filter(id => id !== membre.id));
          }
        },
      },
    ]);
  };

  // ── Marquer TOUS les membres Sur site ─────────────────────────────
  const handleTousSurSite = async () => {
    const enAttente = membres.filter(m => m.statut === 'en_attente');
    if (!enAttente.length) { Alert.alert('Info', 'Tous déjà sur site.'); return; }
    Alert.alert('Tous sur site', `Marquer ${enAttente.length} membre(s) ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Confirmer',
        onPress: async () => {
          try {
            setUpdatingTous(true);
            const results = await Promise.allSettled(
              enAttente.map(m => marquerEntreeMembre(m.id))
            );
            const now   = new Date().toISOString();
            const idsOk = enAttente
              .filter((_, i) => results[i].status === 'fulfilled' && results[i].value?.success)
              .map(m => m.id);
            setMembres(p => p.map(m =>
              idsOk.includes(m.id) ? { ...m, statut: 'sur_site', heure_entree: now } : m
            ));
            const nbEchecs = enAttente.length - idsOk.length;
            if (nbEchecs > 0) Alert.alert('Attention', `${idsOk.length} mis à jour, ${nbEchecs} échec(s).`);
          } catch {
            Alert.alert('Erreur', 'Problème lors de la mise à jour.');
          } finally {
            setUpdatingTous(false);
          }
        },
      },
    ]);
  };

  // ✅ Dérivés statuts
  const st            = STATUT_LABELS[demande.statut] || { color: '#9E9E9E', label: demande.statut || '—' };
  const isConsigne    = STATUTS_CONSIGNE_ACTIF.includes(demande.statut);
  const isDeconsigne  = STATUTS_DECONSIGNE.includes(demande.statut);

  const nbSurSite    = membres.filter(m => getMembreStatut(m) === 'sur_site').length;
  const nbTermine    = membres.filter(m => getMembreStatut(m) === 'termine').length;
  const nbAttente    = membres.filter(m => getMembreStatut(m) === 'en_attente').length;
  const hasEnAttente = membres.some(m => m.statut === 'en_attente');

  // ✅ Rapport disponible si statut déconsigné OU si l'API le confirme
  const rapportDisponible = statut?.rapport_genere === true || isDeconsigne;
  const peutDeconsigner   = statut?.peut_deconsigner === true && !isDeconsigne;

  const ouvrirRapport = () => {
    navigation.navigate('GestionEquipe', { demande });
  };

  // ── Rendu d'un membre ─────────────────────────────────────────────
  const MembreRow = ({ item }) => {
    const statM      = getMembreStatut(item);
    const initiale   = (item.nom || '?')[0].toUpperCase();
    const isUpdating = updatingIds.includes(item.id);

    const statutCfg = {
      en_attente: { color: '#F59E0B', bg: '#FFFBEB', label: 'En attente',  icon: 'time-outline'             },
      sur_site:   { color: '#1565C0', bg: '#E3F2FD', label: 'Sur site',    icon: 'checkmark-circle-outline' },
      termine:    { color: '#9E9E9E', bg: '#F5F5F5', label: 'Terminé',     icon: 'checkmark-done-outline'   },
    }[statM];

    return (
      <View style={S.membreRow}>
        <View style={[S.avatar, { backgroundColor: CFG.bg }]}>
          <Text style={[S.avatarTxt, { color: CFG.couleur }]}>{initiale}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={S.membreNom}>{item.nom}</Text>
          <Text style={S.membreMeta}>
            {item.matricule ? `Mat: ${item.matricule}` : 'Sans matricule'}
            {item.badge_ocp_id ? `  ·  ${item.badge_ocp_id}` : ''}
            {item.numero_cadenas ? `  ·  🔒 ${item.numero_cadenas}` : ''}
          </Text>
          {item.heure_entree && (
            <Text style={S.membreHeure}>
              Entrée {fmtHeure(item.heure_entree)}
              {item.heure_sortie ? `  →  Sortie ${fmtHeure(item.heure_sortie)}` : ''}
            </Text>
          )}
        </View>
        <View style={[S.statutBadge, { backgroundColor: statutCfg.bg }]}>
          <Ionicons name={statutCfg.icon} size={12} color={statutCfg.color} />
          <Text style={[S.statutBadgeTxt, { color: statutCfg.color }]}>{statutCfg.label}</Text>
        </View>
        {statM === 'en_attente' && equipeValidee && isConsigne && (
          <TouchableOpacity
            style={[S.btnSurSite, isUpdating && { opacity: 0.5 }]}
            onPress={() => handleMarquerEntree(item)}
            disabled={isUpdating}
            activeOpacity={0.8}
          >
            {isUpdating
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="log-in-outline" size={16} color="#fff" />
            }
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' }}>
      <ActivityIndicator size="large" color={CFG.couleur} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleur} />

      {/* ── Header ── */}
      <View style={[S.header, { backgroundColor: CFG.couleur }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Détail Consignation</Text>
          <Text style={S.hSub}>{demande.numero_ordre || '—'}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 50 }}>

        {/* ── Bannière rapport disponible (déconsignée) ── */}
        {rapportDisponible && (
          <TouchableOpacity
            style={[S.banner, { backgroundColor: '#2E7D32' }]}
            onPress={ouvrirRapport}
            activeOpacity={0.85}
          >
            <Ionicons name="document-text-outline" size={20} color="#fff" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={S.bannerTitre}>📄 Rapport d'intervention disponible</Text>
              <Text style={S.bannerSub}>Appuyez pour le consulter</Text>
            </View>
            <Ionicons name="open-outline" size={16} color="#fff" />
          </TouchableOpacity>
        )}

        {/* ── Bannière déconsignation possible (tous sortis, pas encore validé) ── */}
        {peutDeconsigner && !rapportDisponible && (
          <TouchableOpacity
            style={[S.banner, { backgroundColor: '#C62828' }]}
            onPress={() => navigation.navigate('GestionEquipe', { demande })}
            activeOpacity={0.85}
          >
            <Ionicons name="lock-open-outline" size={20} color="#fff" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={S.bannerTitre}>🔓 Tous sortis — Valider la déconsignation</Text>
              <Text style={S.bannerSub}>Appuyez pour générer le rapport PDF</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#fff" />
          </TouchableOpacity>
        )}

        {/* ── Infos consignation ── */}
        <View style={S.card}>
          <View style={[S.statutRow, { backgroundColor: st.color + '18' }]}>
            <View style={[S.statutDot, { backgroundColor: st.color }]} />
            <Text style={[S.statutLabel, { color: st.color }]}>{st.label}</Text>
            <Text style={S.statutDate}>{fmtDate(demande.created_at)}</Text>
          </View>
          {[
            { icon: 'layers-outline',        lbl: 'LOT',        val: demande.lot_code || demande.lot },
            { icon: 'hardware-chip-outline', lbl: 'TAG',        val: demande.tag },
            { icon: 'cube-outline',          lbl: 'Équipement', val: demande.equipement_nom },
            { icon: 'person-outline',        lbl: 'Demandeur',  val: demande.demandeur_nom },
          ].map((r, i) => (
            <View key={i} style={S.infoRow}>
              <Ionicons name={r.icon} size={14} color={CFG.couleur} />
              <Text style={S.infoLbl}>{r.lbl}</Text>
              <Text style={S.infoVal} numberOfLines={2}>{r.val || '—'}</Text>
            </View>
          ))}
          <View style={S.raisonBox}>
            <Ionicons name="document-text-outline" size={14} color={CFG.couleur} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={S.raisonLbl}>Raison de l'intervention</Text>
              <Text style={S.raisonTxt}>{demande.raison || '—'}</Text>
            </View>
          </View>
        </View>

        {/* ── Section équipe ── */}
        <View style={S.secRow}>
          <Text style={S.secTitle}>Mon Équipe</Text>
          <View style={[S.secCount, { backgroundColor: CFG.bg }]}>
            <Text style={[S.secCountTxt, { color: CFG.couleur }]}>
              {membres.length} membre{membres.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {/* Stats rapides */}
        {equipeValidee && membres.length > 0 && (
          <View style={S.statsRow}>
            {[
              { val: nbSurSite, label: 'Sur site',   color: '#1565C0', bg: '#E3F2FD' },
              { val: nbAttente, label: 'En attente',  color: '#F59E0B', bg: '#FFFBEB' },
              { val: nbTermine, label: 'Terminés',    color: '#9E9E9E', bg: '#F5F5F5' },
            ].map((s, i) => (
              <View key={i} style={[S.statBox, { backgroundColor: s.bg }]}>
                <Text style={[S.statVal, { color: s.color }]}>{s.val}</Text>
                <Text style={[S.statLbl, { color: s.color }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Bouton "Tous sur site" — uniquement si consignée active */}
        {isConsigne && equipeValidee && hasEnAttente && membres.length > 0 && (
          <View style={{ paddingHorizontal: 14, marginBottom: 10 }}>
            <TouchableOpacity
              style={[S.btnTousSurSite, updatingTous && { opacity: 0.6 }]}
              onPress={handleTousSurSite}
              disabled={updatingTous}
              activeOpacity={0.85}
            >
              {updatingTous ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="people-outline" size={18} color="#fff" />
                  <Text style={S.btnTousSurSiteTxt}>
                    Tous sur site ({nbAttente} en attente)
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Bouton action principal ── */}
        <View style={{ paddingHorizontal: 14, marginBottom: 14 }}>

          {/* CAS 1 : consignée active → Entrer équipe ou Gérer sorties */}
          {isConsigne && !equipeValidee && (
            <TouchableOpacity
              style={[S.actionBtn, { backgroundColor: CFG.couleur }]}
              onPress={() => navigation.navigate('GestionEquipe', { demande })}
              activeOpacity={0.85}
            >
              <Ionicons name="people-outline" size={20} color="#fff" />
              <Text style={S.actionBtnTxt}>👷 Entrer mon équipe</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>
          )}

          {isConsigne && equipeValidee && (
            <TouchableOpacity
              style={[S.actionBtn, { backgroundColor: '#C62828' }]}
              onPress={() => navigation.navigate('GestionEquipe', { demande })}
              activeOpacity={0.85}
            >
              <Ionicons name="lock-open-outline" size={20} color="#fff" />
              <Text style={S.actionBtnTxt}>🔓 Gérer sorties / Déconsigner</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>
          )}

          {/* CAS 2 : déconsignée → Voir rapport PDF uniquement */}
          {isDeconsigne && (
            <TouchableOpacity
              style={[S.actionBtn, { backgroundColor: '#2E7D32' }]}
              onPress={ouvrirRapport}
              activeOpacity={0.85}
            >
              <Ionicons name="document-text-outline" size={20} color="#fff" />
              <Text style={S.actionBtnTxt}>📄 Voir le rapport PDF</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Liste membres ── */}
        <View style={{ paddingHorizontal: 14 }}>
          {membres.length === 0 ? (
            <View style={S.emptyBox}>
              <Ionicons name="people-outline" size={36} color="#BDBDBD" />
              <Text style={S.emptyTxt}>
                {isConsigne
                  ? 'Aucun membre — appuyez sur "Entrer mon équipe"'
                  : isDeconsigne
                    ? 'Intervention terminée — consultez le rapport PDF'
                    : "La consignation doit être validée avant d'enregistrer une équipe"}
              </Text>
            </View>
          ) : (
            membres.map(item => <MembreRow key={item.id} item={item} />)
          )}
        </View>

        {isConsigne && equipeValidee && hasEnAttente && (
          <View style={S.legendeBox}>
            <Ionicons name="information-circle-outline" size={13} color="#9E9E9E" />
            <Text style={S.legendeTxt}>
              Appuyez sur ↵ pour marquer un membre "Sur site" manuellement
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  header:   { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn:  { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:   { color: '#fff', fontSize: 17, fontWeight: '700' },
  hSub:     { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },

  banner:      { flexDirection: 'row', alignItems: 'center', margin: 14, marginBottom: 0, borderRadius: 14, padding: 14, elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  bannerTitre: { color: '#fff', fontWeight: '800', fontSize: 13 },
  bannerSub:   { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2 },

  card:        { backgroundColor: '#fff', margin: 14, borderRadius: 18, padding: 16, elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  statutRow:   { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12, gap: 8 },
  statutDot:   { width: 8, height: 8, borderRadius: 4 },
  statutLabel: { fontSize: 13, fontWeight: '800', flex: 1 },
  statutDate:  { fontSize: 11, color: '#9E9E9E' },
  infoRow:     { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F5F5F5', gap: 8 },
  infoLbl:     { fontSize: 12, color: '#9E9E9E', width: 85 },
  infoVal:     { flex: 1, fontSize: 13, fontWeight: '600', color: '#212121', textAlign: 'right' },
  raisonBox:   { flexDirection: 'row', alignItems: 'flex-start', marginTop: 12, backgroundColor: '#FAFAFA', borderRadius: 10, padding: 10 },
  raisonLbl:   { fontSize: 11, color: '#9E9E9E', marginBottom: 3 },
  raisonTxt:   { fontSize: 13, color: '#424242', lineHeight: 19 },

  secRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10, gap: 8 },
  secTitle:    { fontSize: 14, fontWeight: '700', color: '#424242', flex: 1 },
  secCount:    { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  secCountTxt: { fontSize: 12, fontWeight: '700' },

  statsRow:  { flexDirection: 'row', paddingHorizontal: 14, gap: 8, marginBottom: 12 },
  statBox:   { flex: 1, borderRadius: 12, padding: 10, alignItems: 'center' },
  statVal:   { fontSize: 20, fontWeight: '800' },
  statLbl:   { fontSize: 10, marginTop: 2, fontWeight: '600' },

  btnTousSurSite:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2E7D32', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, gap: 8, elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  btnTousSurSiteTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnSurSite: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#2E7D32', alignItems: 'center', justifyContent: 'center', marginLeft: 8, elevation: 2 },

  actionBtn:    { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 16, gap: 12, elevation: 4, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  actionBtnTxt: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '800' },

  membreRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 8, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 1 } },
  avatar:         { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:      { fontSize: 16, fontWeight: '800' },
  membreNom:      { fontSize: 14, fontWeight: '700', color: '#212121' },
  membreMeta:     { fontSize: 11, color: '#9E9E9E', marginTop: 2 },
  membreHeure:    { fontSize: 11, color: '#2E7D32', marginTop: 3, fontWeight: '600' },
  statutBadge:    { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  statutBadgeTxt: { fontSize: 10, fontWeight: '700' },

  emptyBox:  { alignItems: 'center', padding: 30 },
  emptyTxt:  { fontSize: 13, color: '#9E9E9E', textAlign: 'center', marginTop: 10, lineHeight: 19 },
  legendeBox: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginTop: 4, gap: 6 },
  legendeTxt: { fontSize: 11, color: '#9E9E9E', flex: 1, lineHeight: 16 },
});