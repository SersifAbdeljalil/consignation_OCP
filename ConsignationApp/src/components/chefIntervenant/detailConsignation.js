// src/components/chefIntervenant/detailConsignation.js
//
// ✅ FIX BUG 9 & 10 — Bouton action correct pour chaque métier en déconsignation partielle
//
// PROBLÈME :
//   Quand GC valide en premier → statut demande = 'deconsigne_gc'
//   → isConsigne = false (STATUTS_CONSIGNE_ACTIF ne le contient pas)
//   → isDeconsigne = true
//   → Méca et Élec voyaient "📄 Voir le rapport PDF" au lieu de "🔓 Gérer sorties"
//   → Méca et Élec ne pouvaient plus gérer leur équipe !
//
// FIX :
//   Introduit isConsigneActif = isConsigne classique OU
//     (statut partiel déconsigné ET ce métier n'a PAS encore validé)
//   → Si statut = deconsigne_gc mais a_deja_valide = false → bouton "Gérer sorties" OK
//   → Si statut = deconsigne_gc et a_deja_valide = true → bouton "Voir rapport" OK
//
// ✅ FIX BUG 8 — Bannières multi-métier après rechargement
//   metiers_valides / metiers_restants maintenant retournés par getStatutDeconsignation
//   → Les bannières "En attente de : Mécanique" restent affichées après navigation

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
import { getMesDemandes } from '../../api/intervenant.api';

const CFG = { couleur: '#1565C0', bg: '#E3F2FD' };

const STATUT_LABELS = {
  en_attente:           { color: '#F59E0B', label: 'En attente'        },
  validee:              { color: '#10B981', label: 'Validée'           },
  rejetee:              { color: '#EF4444', label: 'Rejetée'           },
  en_cours:             { color: '#3B82F6', label: 'En cours'          },
  consigne:             { color: '#2E7D32', label: 'Consignée'         },
  consigne_charge:      { color: '#1565C0', label: 'Consignée Chargé'  },
  consigne_process:     { color: '#6A1B9A', label: 'Consignée Process' },
  deconsigne_gc:        { color: '#92400E', label: 'Déconsig. GC'      },
  deconsigne_mec:       { color: '#1e40af', label: 'Déconsig. Méca'    },
  deconsigne_elec:      { color: '#6d28d9', label: 'Déconsig. Élec'    },
  deconsigne_intervent: { color: '#6A1B9A', label: 'Déconsig. Interv.' },
  deconsigne_charge:    { color: '#0277BD', label: 'Déconsig. Chargé'  },
  deconsigne_process:   { color: '#558B2F', label: 'Déconsig. Process' },
  deconsignee:          { color: '#8B5CF6', label: 'Déconsignée'       },
  cloturee:             { color: '#6B7280', label: 'Clôturée'          },
};

// Statuts "consignés" classiques (aucun métier n'a encore validé)
const STATUTS_CONSIGNE_ACTIF = ['consigne', 'consigne_charge', 'consigne_process'];

// Statuts déconsignés partiels (au moins un métier a validé, d'autres non)
const STATUTS_DECONSIGNE_PARTIEL = ['deconsigne_gc', 'deconsigne_mec', 'deconsigne_elec'];

// Tous les statuts déconsignés (partiels + total + anciens)
const STATUTS_DECONSIGNE = [
  'deconsigne_gc', 'deconsigne_mec', 'deconsigne_elec',
  'deconsigne_intervent',
  'deconsigne_charge', 'deconsigne_process',
  'deconsignee',
];

const METIER_LABELS = {
  genie_civil: 'Génie Civil',
  mecanique:   'Mécanique',
  electrique:  'Électrique',
};

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
  const { demande: demandeParam }   = route.params;
  const [demande,        setDemande]        = useState(demandeParam);
  const [membres,        setMembres]        = useState([]);
  const [equipeValidee,  setEquipeValidee]  = useState(false);
  const [statut,         setStatut]         = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [updatingIds,    setUpdatingIds]    = useState([]);
  const [updatingTous,   setUpdatingTous]   = useState(false);

  const charger = useCallback(async () => {
    try {
      setLoading(true);

      const demandeIncomplete = !demandeParam.numero_ordre && !demandeParam.statut;
      if (demandeIncomplete) {
        try {
          const resD = await getMesDemandes();
          if (resD?.success) {
            const found = (resD.data || []).find(d => d.id == demandeParam.id);
            if (found) setDemande(found);
          }
        } catch (e) {
          console.warn('Impossible de recharger la demande complète:', e?.message);
        }
      }

      const [resEquipe, resStatut] = await Promise.all([
        getEquipe(demandeParam.id),
        getStatutDeconsignation(demandeParam.id),
      ]);
      if (resEquipe?.success) {
        setMembres(resEquipe.data.membres || []);
        setEquipeValidee(resEquipe.data.equipe_validee === 1);
      }
      if (resStatut?.success) {
        setStatut(resStatut.data);
        // Synchroniser le statut de la demande depuis la réponse API si disponible
        if (resStatut.data?.statut_demande) {
          setDemande(prev => ({ ...prev, statut: resStatut.data.statut_demande }));
        }
      }
    } catch (e) {
      if (e?.response?.status !== 400 && e?.response?.status !== 404) {
        console.error('DetailConsignation charger error:', e?.message || e);
      }
      setMembres([]);
      setEquipeValidee(false);
    } finally {
      setLoading(false);
    }
  }, [demandeParam.id]);

  useEffect(() => { charger(); }, [charger]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', charger);
    return unsub;
  }, [navigation, charger]);

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

  // ── Dérivés statuts ──────────────────────────────────────────────
  const statutActuel = demande.statut || statut?.statut_demande || '';
  const st           = STATUT_LABELS[statutActuel] || { color: '#9E9E9E', label: statutActuel || '—' };

  // isConsigne classique : aucun métier n'a encore validé
  const isConsigneClassique = STATUTS_CONSIGNE_ACTIF.includes(statutActuel);

  // ✅ FIX BUG 9 — isConsigneActif étendu :
  // Si statut = deconsigne_XX (autre métier a validé) ET ce chef n'a pas encore validé
  // → il foit toujours pouvoir gérer son équipe
  const isDeconsignePartiel = STATUTS_DECONSIGNE_PARTIEL.includes(statutActuel);
  const aDejaValide         = statut?.a_deja_valide_deconsignation === true;
  const isConsigneActif     = isConsigneClassique || (isDeconsignePartiel && !aDejaValide);

  // isDeconsigne : CE chef a validé OU tous ont validé (plus d'actions à faire)
  const isDeconsigne = STATUTS_DECONSIGNE.includes(statutActuel) && aDejaValide;

  // isDeconsigneTotal : tous les métiers ont validé (statut = deconsigne_intervent)
  const isDeconsigneTotal = statutActuel === 'deconsigne_intervent'
    || statutActuel === 'deconsignee'
    || statutActuel === 'deconsigne_charge'
    || statutActuel === 'deconsigne_process';

  const nbSurSite    = membres.filter(m => getMembreStatut(m) === 'sur_site').length;
  const nbTermine    = membres.filter(m => getMembreStatut(m) === 'termine').length;
  const nbAttente    = membres.filter(m => getMembreStatut(m) === 'en_attente').length;
  const hasEnAttente = membres.some(m => m.statut === 'en_attente');

  // Rapport disponible dès que CE métier a validé (a_deja_valide + pdf_path présent)
  // Ne pas utiliser rapport_genere seul — il peut être vrai pour un autre chef
  const monRapportPath     = statut?.rapport_pdf_path || null;
  const rapportDisponible  = aDejaValide && !!monRapportPath;
  const peutDeconsigner    = statut?.peut_deconsigner === true && !aDejaValide;

  // ✅ FIX BUG 8 — metiers_valides / metiers_restants depuis getStatutDeconsignation (maintenant dispo)
  const metiersValides     = statut?.metiers_valides  || [];
  const metiersRestants    = statut?.metiers_restants || [];
  const tousMetiersValides = statut?.tous_metiers_valides === true
    || (metiersRestants.length === 0 && metiersValides.length > 0);

  // Ouvrir MON rapport uniquement (pas celui d'un autre métier)
  const ouvrirMonRapport = () => {
    if (!monRapportPath) {
      Alert.alert('Rapport non disponible', 'Votre rapport n\'a pas encore été généré.');
      return;
    }
    navigation.navigate('GestionEquipe', { demande, ouvrirRapportPdf: monRapportPath });
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
        {/* ✅ FIX BUG 9 — bouton entrée visible même si statut = deconsigne_XX */}
        {statM === 'en_attente' && equipeValidee && isConsigneActif && (
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

        {/* ── Bannière rapport disponible — MON rapport (CE métier a validé) ── */}
        {rapportDisponible && (
          <TouchableOpacity
            style={[S.banner, { backgroundColor: '#2E7D32' }]}
            onPress={ouvrirMonRapport}
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

        {/* ✅ FIX BUG 8 — Bannière déconsignation partielle (maintenant persistante après reload) */}
        {isDeconsignePartiel && !aDejaValide && metiersValides.length > 0 && (
          <View style={[S.banner, { backgroundColor: '#F57C00' }]}>
            <Ionicons name="time-outline" size={20} color="#fff" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={S.bannerTitre}>⏳ Déconsignation en cours</Text>
              <Text style={S.bannerSub}>
                Déjà validé : {metiersValides.map(m => METIER_LABELS[m] || m).join(', ')} ✅
                {'\n'}Votre équipe doit encore valider.
              </Text>
            </View>
          </View>
        )}

        {/* ✅ FIX BUG 8 — Bannière "votre validation enregistrée, en attente des autres" */}
        {aDejaValide && !tousMetiersValides && metiersRestants.length > 0 && (
          <View style={[S.banner, { backgroundColor: '#1565C0' }]}>
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={S.bannerTitre}>✅ Votre déconsignation est validée</Text>
              <Text style={S.bannerSub}>
                En attente de : {metiersRestants.map(m => METIER_LABELS[m] || m).join(', ')}
                {statut?.heure_validation_deconsignation
                  ? `\nValidé le ${statut.heure_validation_deconsignation}` : ''}
              </Text>
            </View>
          </View>
        )}

        {/* Bannière déconsignation possible (tous sortis, pas encore validé) */}
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

        {/* Bannière toutes équipes validées */}
        {tousMetiersValides && metiersValides.length > 0 && (
          <View style={[S.banner, { backgroundColor: '#2E7D32' }]}>
            <Ionicons name="checkmark-done-circle" size={20} color="#fff" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={S.bannerTitre}>✅ Toutes les équipes ont terminé</Text>
              <Text style={S.bannerSub}>
                {metiersValides.map(m => METIER_LABELS[m] || m).join(', ')}
                {'\n'}L'agent peut demander la déconsignation finale
              </Text>
            </View>
          </View>
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
              { val: nbSurSite, label: 'Sur site',  color: '#1565C0', bg: '#E3F2FD' },
              { val: nbAttente, label: 'En attente', color: '#F59E0B', bg: '#FFFBEB' },
              { val: nbTermine, label: 'Terminés',   color: '#9E9E9E', bg: '#F5F5F5' },
            ].map((s, i) => (
              <View key={i} style={[S.statBox, { backgroundColor: s.bg }]}>
                <Text style={[S.statVal, { color: s.color }]}>{s.val}</Text>
                <Text style={[S.statLbl, { color: s.color }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ✅ FIX BUG 9 — Bouton "Tous sur site" visible même si statut = deconsigne_XX */}
        {isConsigneActif && equipeValidee && hasEnAttente && membres.length > 0 && (
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

          {/* ✅ FIX BUG 10 — CAS 1 : consigné ou déconsigné partiel (CE métier pas encore validé)
              → Entrer/Gérer équipe selon si équipe validée ou non */}
          {isConsigneActif && !equipeValidee && (
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

          {isConsigneActif && equipeValidee && (
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

          {/* CAS 2 : CE métier a validé → voir MON rapport */}
          {isDeconsigne && (
            <TouchableOpacity
              style={[S.actionBtn, { backgroundColor: '#2E7D32' }]}
              onPress={ouvrirMonRapport}
              activeOpacity={0.85}
            >
              <Ionicons name="document-text-outline" size={20} color="#fff" />
              <Text style={S.actionBtnTxt}>📄 Voir mon rapport PDF</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>
          )}

          {/* CAS 3 : tous métiers validés mais CE chef a aussi validé */}
          {isDeconsigneTotal && aDejaValide && monRapportPath && (
            <TouchableOpacity
              style={[S.actionBtn, { backgroundColor: '#2E7D32' }]}
              onPress={ouvrirMonRapport}
              activeOpacity={0.85}
            >
              <Ionicons name="document-text-outline" size={20} color="#fff" />
              <Text style={S.actionBtnTxt}>📄 Voir mon rapport PDF</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>
          )}

          {/* CAS 4 : tous métiers validés mais CE chef n'est PAS dans la demande */}
          {isDeconsigneTotal && !aDejaValide && !isConsigneActif && (
            <View style={[S.actionBtn, { backgroundColor: '#9E9E9E' }]}>
              <Ionicons name="checkmark-done-outline" size={20} color="#fff" />
              <Text style={S.actionBtnTxt}>✅ Intervention terminée</Text>
            </View>
          )}
        </View>

        {/* ── Liste membres ── */}
        <View style={{ paddingHorizontal: 14 }}>
          {membres.length === 0 ? (
            <View style={S.emptyBox}>
              <Ionicons name="people-outline" size={36} color="#BDBDBD" />
              <Text style={S.emptyTxt}>
                {aDejaValide
                  ? 'Votre intervention est terminée — consultez votre rapport PDF'
                  : isConsigneActif
                    ? 'Aucun membre — appuyez sur "Entrer mon équipe"'
                    : "La consignation doit être validée avant d'enregistrer une équipe"}
              </Text>
            </View>
          ) : (
            membres.map(item => <MembreRow key={item.id} item={item} />)
          )}
        </View>

        {/* ✅ FIX BUG 9 — légende visible aussi en déconsignation partielle */}
        {isConsigneActif && equipeValidee && hasEnAttente && (
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

  banner:      { flexDirection: 'row', alignItems: 'center', margin: 14, marginBottom: 6, borderRadius: 14, padding: 14, elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
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

  btnTousSurSite:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2E7D32', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, gap: 8, elevation: 3 },
  btnTousSurSiteTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnSurSite: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#2E7D32', alignItems: 'center', justifyContent: 'center', marginLeft: 8, elevation: 2 },

  actionBtn:    { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 16, gap: 12, elevation: 4 },
  actionBtnTxt: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '800' },

  membreRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 8, elevation: 2 },
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