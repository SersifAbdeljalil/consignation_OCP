// src/screens/chef/monEquipe.js
// ══════════════════════════════════════════════════════════════════
// CHANGEMENTS vs version précédente :
//  1. Import getStatutDeconsignation pour détecter rapport_genere + peut_deconsigner
//  2. Navigation vers ScanBadge pour tout (entrée + déconsignation + PDF)
//     → plus de navigation séparée vers DeconsignationEquipe depuis ici
//  3. Bannière "Rapport disponible" si rapport_genere
//  4. Bannière "Déconsignation possible" si peut_deconsigner
//  5. Bouton bas "VOIR LE RAPPORT PDF" si rapport généré
// ══════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Platform, RefreshControl, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMesDemandes } from '../../api/intervenant.api';
import {
  getEquipe,
  getStatutDeconsignation, // ✅ déjà importé
  marquerEntreeMembres,
} from '../../api/equipeIntervention.api';

const STATUTS_EQUIPE = ['consigne', 'consigne_charge', 'consigne_process'];

const CONFIGS = {
  genie_civil: { couleur: '#1565C0', bg: '#E3F2FD', vertBg: '#E8F5E9', vert: '#388E3C' },
  mecanique:   { couleur: '#E65100', bg: '#FFF3E0', vertBg: '#E8F5E9', vert: '#388E3C' },
  electrique:  { couleur: '#6A1B9A', bg: '#F3E5F5', vertBg: '#E8F5E9', vert: '#388E3C' },
  process:     { couleur: '#00695C', bg: '#E0F2F1', vertBg: '#E8F5E9', vert: '#388E3C' },
};
const CFG_DEFAULT = { couleur: '#1565C0', bg: '#E3F2FD', vertBg: '#E8F5E9', vert: '#388E3C' };

const STATUT_CONFIG = {
  en_attente: { label: 'En attente', color: '#FFA000', icon: 'time-outline',    bg: '#FFF8E1' },
  sur_site:   { label: 'Sur site',   color: '#1565C0', icon: 'construct',        bg: '#E3F2FD' },
  sortie:     { label: 'Sorti',      color: '#388E3C', icon: 'checkmark-circle', bg: '#E8F5E9' },
};

const STATUT_DEMANDE_CFG = {
  consigne:         { color: '#2E7D32', bg: '#E8F5E9', label: 'Consignée',       icon: 'shield-checkmark-outline' },
  consigne_charge:  { color: '#1565C0', bg: '#E3F2FD', label: 'Consig. Chargé', icon: 'flash-outline'            },
  consigne_process: { color: '#6A1B9A', bg: '#F3E5F5', label: 'Consig. Process',icon: 'settings-outline'         },
};

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()}`;
};

export default function MonEquipe({ route, navigation }) {
  const params     = route?.params || {};
  const userMetier = params.userMetier || null;
  const CFG        = CONFIGS[userMetier] || CFG_DEFAULT;

  const [demandeSelectionnee, setDemandeSelectionnee] = useState(params.demande || null);

  const [listeDemandes, setListeDemandes] = useState([]);
  const [loadingListe,  setLoadingListe]  = useState(!params.demande);

  const [membres,        setMembres]       = useState([]);
  const [statut,         setStatut]        = useState(null);
  const [loading,        setLoading]       = useState(false);
  const [refreshing,     setRefreshing]    = useState(false);
  const [loadingEntree,  setLoadingEntree] = useState(false);
  const [equipeValidee,  setEquipeValidee] = useState(false);

  // ── Charger liste demandes ────────────────────────────────────────
  const chargerListe = useCallback(async () => {
    try {
      setLoadingListe(true);
      const res = await getMesDemandes();
      if (res?.success) {
        const consignees = (res.data || []).filter(d => STATUTS_EQUIPE.includes(d.statut));
        setListeDemandes(consignees);
        if (consignees.length === 1) setDemandeSelectionnee(consignees[0]);
      }
    } catch { Alert.alert('Erreur', 'Impossible de charger les demandes.'); }
    finally { setLoadingListe(false); }
  }, []);

  // ── Charger détail équipe ─────────────────────────────────────────
  const chargerDonnees = useCallback(async () => {
    if (!demandeSelectionnee?.id) return;
    try {
      setLoading(true);
      const [resEquipe, resStatut] = await Promise.all([
        getEquipe(demandeSelectionnee.id),
        getStatutDeconsignation(demandeSelectionnee.id),
      ]);
      if (resEquipe.success) {
        setMembres(resEquipe.data.membres || []);
        setEquipeValidee(resEquipe.data.equipe_validee === 1);
      }
      if (resStatut.success) setStatut(resStatut.data);
    } catch { Alert.alert('Erreur', 'Impossible de charger les données.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [demandeSelectionnee?.id]);

  useEffect(() => {
    if (!demandeSelectionnee) chargerListe();
    else chargerDonnees();
  }, [demandeSelectionnee]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      if (demandeSelectionnee) chargerDonnees();
      else chargerListe();
    });
    return unsub;
  }, [navigation, demandeSelectionnee]);

  const onRefresh = () => { setRefreshing(true); chargerDonnees(); };

  // ── Entrée sur site (tous) ────────────────────────────────────────
  const handleTousEntreeSite = () => {
    const enAttente = membres.filter(m => m.statut === 'en_attente');
    if (!enAttente.length) { Alert.alert('Info', 'Aucun membre en attente.'); return; }
    Alert.alert(
      'Confirmer entrée',
      `Marquer ${enAttente.length} membre(s) sur site ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            try {
              setLoadingEntree(true);
              const res = await marquerEntreeMembres(demandeSelectionnee.id, { tous: true });
              if (res.success) {
                await chargerDonnees();
                Alert.alert('✅ Entrée enregistrée', `${enAttente.length} membre(s) sur site.`);
              } else Alert.alert('Erreur', res.message);
            } catch (e) {
              Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
            } finally { setLoadingEntree(false); }
          },
        },
      ]
    );
  };

  // ── Navigation PDF ✅ NOUVEAU ─────────────────────────────────────
  const ouvrirPdf = (pdfPath) => {
    const baseUrl = 'http://192.168.1.104:3000'; // adapter à votre config
    const fullUrl = `${baseUrl}/${pdfPath}`.replace(/([^:]\/)\/+/g, '$1');
    navigation.navigate('PdfViewer', {
      url:   fullUrl,
      titre: `Rapport — ${demandeSelectionnee?.numero_ordre || ''}`,
      role:  'chef_equipe',
    });
  };

  const handleBack = () => {
    if (params.demande) { navigation.goBack(); }
    else { setDemandeSelectionnee(null); setMembres([]); setStatut(null); setEquipeValidee(false); }
  };

  // ══════════════════════════════════════════════════════════════════
  // RENDU LISTE
  // ══════════════════════════════════════════════════════════════════
  if (!demandeSelectionnee) {
    if (loadingListe) return (
      <View style={S.centered}>
        <ActivityIndicator size="large" color={CFG.couleur} />
        <Text style={S.loadingTxt}>Chargement...</Text>
      </View>
    );

    return (
      <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
        <View style={[S.header, { backgroundColor: CFG.couleur }]}>
          <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={S.hTitle}>Mon Équipe</Text>
            <Text style={S.hSub}>
              {listeDemandes.length > 0
                ? `${listeDemandes.length} chantier${listeDemandes.length > 1 ? 's' : ''} actif${listeDemandes.length > 1 ? 's' : ''}`
                : 'Aucun chantier actif'}
            </Text>
          </View>
          <TouchableOpacity style={S.backBtn} onPress={chargerListe}>
            <Ionicons name="refresh-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {listeDemandes.length === 0 ? (
          <View style={[S.centered, { marginTop: 60 }]}>
            <View style={S.emptyIcon}>
              <Ionicons name="people-outline" size={40} color={CFG.couleur} />
            </View>
            <Text style={S.emptyTitre}>Aucun chantier actif</Text>
            <Text style={S.emptySub}>Vos chantiers apparaîtront ici dès qu'une demande sera consignée.</Text>
          </View>
        ) : (
          <FlatList
            data={listeDemandes}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const sc = STATUT_DEMANDE_CFG[item.statut] || STATUT_DEMANDE_CFG.consigne;
              return (
                <TouchableOpacity
                  style={S.demandeCard}
                  onPress={() => setDemandeSelectionnee(item)}
                  activeOpacity={0.85}
                >
                  <View style={[S.demandeStripe, { backgroundColor: sc.color }]} />
                  <View style={{ flex: 1, padding: 14 }}>
                    <View style={S.demandeTop}>
                      <View style={[S.statutPill, { backgroundColor: sc.bg }]}>
                        <Ionicons name={sc.icon} size={11} color={sc.color} />
                        <Text style={[S.statutPillTxt, { color: sc.color }]}>{sc.label}</Text>
                      </View>
                      <Text style={S.dateTxt}>{fmtDate(item.created_at)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Ionicons name="hardware-chip-outline" size={14} color={CFG.couleur} />
                      <Text style={S.demandeTag}>{item.tag || item.code_equipement || '—'}</Text>
                    </View>
                    {item.equipement_nom && (
                      <Text style={S.demandeEquip} numberOfLines={1}>{item.equipement_nom}</Text>
                    )}
                    <Text style={S.demandeOrdre}>{item.numero_ordre || '—'}</Text>
                    <View style={[S.chipEquipe, { backgroundColor: CFG.bg }]}>
                      <Ionicons name="people-outline" size={12} color={CFG.couleur} />
                      <Text style={[S.chipEquipeTxt, { color: CFG.couleur }]}>Gérer l'équipe →</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // RENDU DÉTAIL
  // ══════════════════════════════════════════════════════════════════
  if (loading) return (
    <View style={S.centered}>
      <ActivityIndicator size="large" color={CFG.couleur} />
      <Text style={S.loadingTxt}>Chargement de l'équipe...</Text>
    </View>
  );

  const membresEnAttente = membres.filter(m => m.statut === 'en_attente');
  const membresSurSite   = membres.filter(m => m.statut === 'sur_site');
  const membresSortis    = membres.filter(m => m.statut === 'sortie');
  const peutDeconsigner  = statut?.peut_deconsigner === true;
  const rapportDisponible = statut?.rapport_genere === true; // ✅ NOUVEAU
  const rapportPdfPath    = statut?.rapport_pdf_path || null;

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      {/* Header */}
      <View style={[S.header, { backgroundColor: CFG.couleur }]}>
        <TouchableOpacity style={S.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Mon équipe</Text>
          <Text style={S.hSub}>
            {demandeSelectionnee.numero_ordre} — TAG {demandeSelectionnee.tag || demandeSelectionnee.code_equipement || ''}
          </Text>
        </View>
        {/* ✅ CHANGEMENT : icône ouvre ScanBadge (déconsignation) si équipe validée */}
        {equipeValidee ? (
          <TouchableOpacity
            style={S.backBtn}
            onPress={() => navigation.navigate('ScanBadge', { demande: demandeSelectionnee, userMetier })}
          >
            <Ionicons name="log-out-outline" size={22} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      {/* ── Bannière rapport disponible ✅ NOUVEAU ── */}
      {rapportDisponible && rapportPdfPath && (
        <TouchableOpacity
          style={[S.banner, { backgroundColor: '#2E7D32' }]}
          onPress={() => ouvrirPdf(rapportPdfPath)}
          activeOpacity={0.85}
        >
          <Ionicons name="document-text-outline" size={18} color="#fff" />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={S.bannerTitre}>📄 Rapport d'intervention disponible</Text>
            <Text style={S.bannerSub}>Appuyez pour consulter le PDF</Text>
          </View>
          <Ionicons name="open-outline" size={14} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Bannière déconsignation */}
      {equipeValidee && !rapportDisponible && (
        <View style={[S.banner, {
          backgroundColor: peutDeconsigner ? CFG.vertBg : '#FFF8E1',
          borderColor:     peutDeconsigner ? CFG.vert   : '#FFA000',
        }]}>
          <Ionicons
            name={peutDeconsigner ? 'checkmark-circle' : 'time-outline'}
            size={18}
            color={peutDeconsigner ? CFG.vert : '#FFA000'}
          />
          <Text style={[S.bannerTxt, { color: peutDeconsigner ? CFG.vert : '#E65100' }]}>
            {peutDeconsigner
              ? '✅ Déconsignation possible — tous les membres sont sortis'
              : `${membresSurSite.length} membre(s) encore sur site — déconsignation bloquée`
            }
          </Text>
        </View>
      )}

      {/* Compteurs */}
      <View style={S.statsRow}>
        <View style={[S.statBox, { borderColor: '#FFA000' }]}>
          <Text style={[S.statVal, { color: '#FFA000' }]}>{membresEnAttente.length}</Text>
          <Text style={S.statLbl}>En attente</Text>
        </View>
        <View style={[S.statBox, { borderColor: CFG.couleur }]}>
          <Text style={[S.statVal, { color: CFG.couleur }]}>{membresSurSite.length}</Text>
          <Text style={S.statLbl}>Sur site</Text>
        </View>
        <View style={[S.statBox, { borderColor: CFG.vert }]}>
          <Text style={[S.statVal, { color: CFG.vert }]}>{membresSortis.length}</Text>
          <Text style={S.statLbl}>Sortis</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[CFG.couleur]} />}
      >
        {membres.length === 0 ? (
          <View style={[S.centered, { marginTop: 60 }]}>
            <Ionicons name="people-outline" size={54} color="#BDBDBD" />
            <Text style={S.emptyTxt}>Aucun membre dans l'équipe</Text>
          </View>
        ) : (
          membres.map(m => {
            const sc = STATUT_CONFIG[m.statut] || STATUT_CONFIG.en_attente;
            return (
              <View key={m.id} style={S.membreCard}>
                <View style={[S.avatar, { backgroundColor: sc.bg }]}>
                  <Text style={[S.avatarTxt, { color: sc.color }]}>{(m.nom || '?')[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={S.membreNom}>{m.nom}</Text>
                  {/* ✅ CHANGEMENT : affiche cad_id si disponible */}
                  <Text style={S.membreMeta}>
                    {m.badge_ocp_id || m.matricule || '—'}
                    {m.cad_id
                      ? `  ·  QR: ${m.cad_id.substring(0, 8)}…`
                      : m.numero_cadenas ? `  ·  🔒 ${m.numero_cadenas}` : ''}
                  </Text>
                  {m.heure_entree && (
                    <Text style={[S.membreHeure, { color: CFG.couleur }]}>
                      ↳ Entrée : {new Date(m.heure_entree).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  )}
                  {m.heure_sortie && (
                    <Text style={[S.membreHeure, { color: CFG.vert }]}>
                      ↳ Sortie : {new Date(m.heure_sortie).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  )}
                </View>
                <View style={[S.statutBadge, { backgroundColor: sc.bg }]}>
                  <Ionicons name={sc.icon} size={14} color={sc.color} />
                  <Text style={[S.statutTxt, { color: sc.color }]}>{sc.label}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Boutons bas */}
      <View style={[S.bottomBar, { paddingBottom: Platform.OS === 'ios' ? 28 : 16 }]}>
        {!equipeValidee && (
          <TouchableOpacity
            style={[S.btnSecondaire, { borderColor: CFG.couleur, marginBottom: 8 }]}
            onPress={() => navigation.navigate('ScanBadge', { demande: demandeSelectionnee, userMetier })}
            activeOpacity={0.8}
          >
            <Ionicons name="scan-outline" size={18} color={CFG.couleur} />
            <Text style={[S.btnSecondaireTxt, { color: CFG.couleur }]}>Gérer les membres</Text>
          </TouchableOpacity>
        )}

        {equipeValidee && membresEnAttente.length > 0 && (
          <TouchableOpacity
            style={[S.btnValider, { backgroundColor: CFG.couleur, marginBottom: 8 }, loadingEntree && { opacity: 0.6 }]}
            onPress={handleTousEntreeSite}
            disabled={loadingEntree}
            activeOpacity={0.85}
          >
            {loadingEntree
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Ionicons name="log-in-outline" size={20} color="#fff" />
                  <Text style={S.btnValiderTxt}>MARQUER ENTRÉE SUR SITE ({membresEnAttente.length})</Text>
                </>
            }
          </TouchableOpacity>
        )}

        {/* ✅ CHANGEMENT : ScanBadge gère sorties + déconsignation + PDF */}
        {equipeValidee && membresSurSite.length > 0 && (
          <TouchableOpacity
            style={[S.btnValider, { backgroundColor: CFG.vert }]}
            onPress={() => navigation.navigate('ScanBadge', { demande: demandeSelectionnee, userMetier })}
            activeOpacity={0.85}
          >
            <Ionicons name="log-out-outline" size={20} color="#fff" />
            <Text style={S.btnValiderTxt}>ENREGISTRER LES SORTIES</Text>
          </TouchableOpacity>
        )}

        {/* ✅ NOUVEAU : si déconsignation possible → bouton dans ScanBadge */}
        {equipeValidee && peutDeconsigner && !rapportDisponible && (
          <TouchableOpacity
            style={[S.btnValider, { backgroundColor: '#C62828', marginTop: 8 }]}
            onPress={() => navigation.navigate('ScanBadge', { demande: demandeSelectionnee, userMetier })}
            activeOpacity={0.85}
          >
            <Ionicons name="lock-open-outline" size={20} color="#fff" />
            <Text style={S.btnValiderTxt}>VALIDER DÉCONSIGNATION + PDF</Text>
          </TouchableOpacity>
        )}

        {/* ✅ NOUVEAU : rapport déjà généré */}
        {rapportDisponible && rapportPdfPath && (
          <TouchableOpacity
            style={[S.btnValider, { backgroundColor: '#2E7D32', marginTop: 8 }]}
            onPress={() => ouvrirPdf(rapportPdfPath)}
            activeOpacity={0.85}
          >
            <Ionicons name="document-text-outline" size={20} color="#fff" />
            <Text style={S.btnValiderTxt}>VOIR LE RAPPORT PDF</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  centered:        { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingTxt:      { marginTop: 12, color: '#757575', fontSize: 14 },
  header:          { paddingTop: Platform.OS === 'ios' ? 52 : 36, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn:         { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)' },
  hTitle:          { color: '#fff', fontWeight: '700', fontSize: 16 },
  hSub:            { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },

  // ✅ NOUVEAU — bannières
  banner:          { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 14, marginBottom: 0, borderRadius: 12, padding: 12, borderWidth: 1 },
  bannerTxt:       { flex: 1, fontSize: 13, fontWeight: '600' },
  bannerTitre:     { color: '#fff', fontWeight: '800', fontSize: 12 },
  bannerSub:       { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 1 },

  statsRow:        { flexDirection: 'row', margin: 14, gap: 10 },
  statBox:         { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  statVal:         { fontSize: 22, fontWeight: '800' },
  statLbl:         { fontSize: 11, color: '#757575', marginTop: 2 },
  membreCard:      { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  avatar:          { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarTxt:       { fontSize: 18, fontWeight: '700' },
  membreNom:       { fontSize: 15, fontWeight: '600', color: '#212121' },
  membreMeta:      { fontSize: 12, color: '#757575', marginTop: 2 },
  membreHeure:     { fontSize: 11, marginTop: 2 },
  emptyTxt:        { fontSize: 16, color: '#9E9E9E', marginTop: 14, fontWeight: '500' },
  statutBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  statutTxt:       { fontSize: 11, fontWeight: '600' },
  bottomBar:       { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F0F0F0', elevation: 8 },
  btnValider:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 15, gap: 8 },
  btnValiderTxt:   { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 0.5 },
  btnSecondaire:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 12, borderWidth: 1.5, gap: 8, backgroundColor: '#fff' },
  btnSecondaireTxt:{ fontWeight: '600', fontSize: 14 },
  demandeCard:     { backgroundColor: '#fff', borderRadius: 16, marginBottom: 12, flexDirection: 'row', overflow: 'hidden', elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  demandeStripe:   { width: 5 },
  demandeTop:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  statutPill:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statutPillTxt:   { fontSize: 10, fontWeight: '700' },
  dateTxt:         { fontSize: 11, color: '#9E9E9E' },
  demandeTag:      { fontSize: 16, fontWeight: '800', color: '#212121' },
  demandeEquip:    { fontSize: 12, color: '#616161', marginBottom: 2 },
  demandeOrdre:    { fontSize: 11, color: '#9E9E9E', marginBottom: 8 },
  chipEquipe:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, alignSelf: 'flex-start' },
  chipEquipeTxt:   { fontSize: 12, fontWeight: '700' },
  emptyIcon:       { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitre:      { fontSize: 16, fontWeight: '700', color: '#424242', marginBottom: 8 },
  emptySub:        { fontSize: 13, color: '#9E9E9E', textAlign: 'center', lineHeight: 20 },
});