// src/components/agent/detailDemande.js
// ✅ Auto-refresh silencieux toutes les 1s
// ✅ Dates au format dd/mm/yyyy à hh:mm:ss
// ✅ Timeline déconsignation dynamique par métier
// ✅ NOUVEAU : Bouton "Demander la déconsignation" quand tous les métiers ont terminé
//    → Appelle POST /api/demandes/:id/demander-deconsignation
//    → Notifie le chargé + chef process

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StatusBar, ActivityIndicator, StyleSheet, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACE, RADIUS, SHADOW } from '../../styles/variables.css';
import { getDemandeById } from '../../api/demande.api';
import { API_URL } from '../../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const REFRESH_INTERVAL_MS = 1000;

const STATUT_CONFIG = {
  en_attente:           { color: COLORS.statut.en_attente,  bg: '#FFF8E1',        label: 'EN ATTENTE',        icon: 'time-outline'              },
  validee:              { color: COLORS.statut.validee,     bg: COLORS.greenPale, label: 'VALIDÉE',           icon: 'checkmark-circle-outline'  },
  rejetee:              { color: COLORS.statut.rejetee,     bg: '#FFEBEE',        label: 'REJETÉE',           icon: 'close-circle-outline'      },
  en_cours:             { color: COLORS.statut.en_cours,    bg: COLORS.bluePale,  label: 'EN COURS',          icon: 'sync-outline'              },
  consigne_charge:      { color: '#1d4ed8',                 bg: '#dbeafe',        label: 'CONSIG. EN COURS',  icon: 'time-outline'              },
  consigne_process:       { color: '#b45309',                 bg: '#fde68a',        label: 'CONSIG. EN COURS',    icon: 'time-outline'              },
  consigne:               { color: COLORS.statut.validee,     bg: '#D1FAE5',        label: 'CONSIGNÉ',            icon: 'lock-closed-outline'       },
  deconsigne_genie_civil: { color: '#7C3AED',                 bg: '#EDE9FE',        label: 'DÉCONSIG. GÉNIE CV',  icon: 'business-outline'          },
  deconsigne_mecanique:   { color: '#D97706',                 bg: '#FEF3C7',        label: 'DÉCONSIG. MÉCA',      icon: 'settings-outline'          },
  deconsigne_electrique:  { color: COLORS.statut.en_cours,    bg: COLORS.bluePale,  label: 'DÉCONSIG. ÉLEC',      icon: 'flash-outline'             },
  deconsigne_charge:      { color: '#1d4ed8',                 bg: '#dbeafe',        label: 'DÉCONSIG. CHARGÉ',    icon: 'flash-outline'             },
  deconsigne_process:     { color: '#b45309',                 bg: '#fde68a',        label: 'DÉCONSIG. PROCESS',   icon: 'cog-outline'               },
  deconsignee:            { color: COLORS.statut.deconsignee, bg: '#F3E5F5',        label: 'DÉCONSIGNÉE',         icon: 'unlock-outline'            },
  cloturee:               { color: COLORS.statut.cloturee,    bg: COLORS.grayLight, label: 'CLÔTURÉE',            icon: 'archive-outline'           },
};

const TYPES_LABELS = {
  genie_civil: { label: 'Génie Civil',  icon: 'business-outline',   color: '#7C3AED', bg: '#EDE9FE' },
  mecanique:   { label: 'Mécanique',    icon: 'settings-outline',   color: '#D97706', bg: '#FEF3C7' },
  electrique:  { label: 'Électrique',   icon: 'flash-outline',      color: COLORS.statut.en_cours, bg: COLORS.bluePale },
  process:     { label: 'Process',      icon: 'git-branch-outline', color: '#059669', bg: '#D1FAE5' },
};

const DECONSIG_METIER_CONFIG = {
  genie_civil: { label: 'Déconsignation Génie Civil',  icon: 'business-outline',  color: '#7C3AED' },
  mecanique:   { label: 'Déconsignation Mécanique',    icon: 'settings-outline',  color: '#D97706' },
  electrique:  { label: 'Déconsignation Électrique',   icon: 'flash-outline',     color: COLORS.statut.en_cours },
};

const METIERS_EQUIPE = ['genie_civil', 'mecanique', 'electrique'];

const STATUTS_DECONS_EQUIPE = [
  'deconsigne_genie_civil', 'deconsigne_mecanique', 'deconsigne_electrique',
];

const STATUTS_APRES_CONSIGNE = [
  'consigne',
  ...STATUTS_DECONS_EQUIPE,
  'deconsigne_charge',
  'deconsigne_process', 'deconsignee', 'cloturee',
];

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} à ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
};

const hasPdf = (statut) => [
  'consigne',
  'deconsigne_genie_civil', 'deconsigne_mecanique', 'deconsigne_electrique',
  'deconsigne_charge', 'deconsigne_process', 'deconsignee', 'cloturee',
].includes(statut);

const getConsignationInfo = (statut) => {
  if (statut === 'consigne_charge') return {
    show: true, icon: 'flash-outline', color: '#1d4ed8', bg: '#dbeafe',
    title: 'Consignation électrique effectuée',
    sub: 'En attente de la validation du chef process pour finaliser.',
  };
  if (statut === 'consigne_process') return {
    show: true, icon: 'cog-outline', color: '#b45309', bg: '#fde68a',
    title: 'Consignation process effectuée',
    sub: 'En attente de la validation du chargé de consignation pour finaliser.',
  };
  return { show: false };
};

export default function DetailDemande({ navigation, route }) {
  const demandeParam = route.params?.demande;
  const [demande,            setDemande]            = useState(demandeParam || null);
  const [loading,            setLoading]            = useState(!demandeParam?.equipement_nom);
  const [erreur,             setErreur]             = useState(null);
  const [envoyiDecons,       setEnvoyiDecons]       = useState(false); // chargement bouton décons

  const intervalRef   = useRef(null);
  const isMountedRef  = useRef(true);
  const prevStatutRef = useRef(demandeParam?.statut);

  const chargerSilencieux = useCallback(async () => {
    if (!demandeParam?.id) return;
    try {
      const res = await getDemandeById(demandeParam.id);
      if (!isMountedRef.current) return;
      if (res?.success) {
        const nouvelleData = res.data;
        if (prevStatutRef.current && prevStatutRef.current !== nouvelleData.statut) {
          const cfg = STATUT_CONFIG[nouvelleData.statut];
          Alert.alert('🔄 Statut mis à jour',
            `La demande est maintenant : ${cfg?.label || nouvelleData.statut}`,
            [{ text: 'OK' }]
          );
        }
        prevStatutRef.current = nouvelleData.statut;
        setDemande(nouvelleData);
      }
    } catch {}
  }, [demandeParam?.id]);

  const charger = useCallback(async () => {
    if (!demandeParam?.id) { setErreur('Identifiant manquant'); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await getDemandeById(demandeParam.id);
      if (!isMountedRef.current) return;
      if (res?.success) {
        prevStatutRef.current = res.data.statut;
        setDemande(res.data);
        setErreur(null);
      } else {
        setErreur(res?.message || 'Impossible de charger la demande');
      }
    } catch {
      if (!isMountedRef.current) return;
      setErreur('Erreur de connexion.');
    } finally {
      if (!isMountedRef.current) return;
      setLoading(false);
    }
  }, [demandeParam?.id]);

  useEffect(() => {
    isMountedRef.current = true;
    if (!demandeParam?.equipement_nom || !demandeParam?.raison) charger();
    else setLoading(false);
    return () => { isMountedRef.current = false; };
  }, [charger]);

  useEffect(() => {
    const finaux = ['cloturee', 'rejetee', 'deconsignee'];
    if (demande && finaux.includes(demande.statut)) return;
    intervalRef.current = setInterval(chargerSilencieux, REFRESH_INTERVAL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [chargerSilencieux, demande?.statut]);

  const ouvrirPDF = () => navigation.navigate('PdfViewer', {
    url: `${API_URL}/charge/demandes/${demande.id}/pdf`,
    titre: demande.numero_ordre,
  });

  // ── ✅ NOUVEAU : Envoyer demande de déconsignation ─────────────
  const envoyerDemandeDeconsignation = async () => {
    Alert.alert(
      '🔓 Demander la déconsignation',
      `Voulez-vous notifier le chargé et le chef process pour déconsigner le départ ${demande.tag} ?\n\nToutes vos équipes ont bien quitté le chantier.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          style: 'destructive',
          onPress: async () => {
            setEnvoyiDecons(true);
            try {
              const token = await AsyncStorage.getItem('token');
              const response = await fetch(
                `${API_URL}/demandes/${demande.id}/demander-deconsignation`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                  },
                }
              );
              const data = await response.json();
              if (response.ok && data.success) {
                Alert.alert(
                  '✅ Demande envoyée',
                  'Le chargé et le chef process ont été notifiés pour effectuer la déconsignation.',
                  [{ text: 'OK' }]
                );
                chargerSilencieux(); // Rafraîchir
              } else {
                Alert.alert('Erreur', data.message || 'Impossible d\'envoyer la demande.');
              }
            } catch (e) {
              Alert.alert('Erreur', 'Impossible de joindre le serveur.');
            } finally {
              setEnvoyiDecons(false);
            }
          },
        },
      ]
    );
  };

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={COLORS.green} />
      <Text style={{ color: COLORS.gray, marginTop: SPACE.md, fontSize: FONTS.size.sm }}>
        Chargement de la demande...
      </Text>
    </View>
  );

  if (erreur || !demande) return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.greenDark} />
      <View style={[S.header, { backgroundColor: COLORS.green }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Détail demande</Text>
        <View style={{ width: 36 }} />
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.xl }}>
        <Ionicons name="warning-outline" size={56} color={COLORS.statut.rejetee} />
        <Text style={{ fontSize: FONTS.size.lg, fontWeight: FONTS.weight.bold, color: COLORS.grayDeep, marginTop: SPACE.md, textAlign: 'center' }}>
          Impossible de charger
        </Text>
        <Text style={{ fontSize: FONTS.size.sm, color: COLORS.gray, marginTop: SPACE.sm, textAlign: 'center' }}>
          {erreur || 'Demande introuvable'}
        </Text>
        <TouchableOpacity style={S.retryBtn} onPress={charger}>
          <Ionicons name="refresh-outline" size={18} color={COLORS.white} />
          <Text style={S.retryBtnTxt}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const cfg  = STATUT_CONFIG[demande.statut] || STATUT_CONFIG.en_attente;
  const types = Array.isArray(demande.types_intervenants) ? demande.types_intervenants : [];
  const info  = getConsignationInfo(demande.statut);

  const metiersEquipeDemande = types.filter(t => METIERS_EQUIPE.includes(t));
  const deconParMetier = demande.deconsignation_par_metier || {};
  const afficherDeconsignation = STATUTS_APRES_CONSIGNE.includes(demande.statut);
  const tousDeconsignes = metiersEquipeDemande.length > 0
    && metiersEquipeDemande.every(m => deconParMetier[m]?.fait === true);

  // ✅ Afficher le bouton déconsignation si :
  // - Tous les métiers ont terminé (tous sortis) ET statut est un statut déconsignation équipe
  // - OU consigne (sans métiers équipe)
  // - La déconsignation n'a pas encore été demandée
  const peutDemanderDecons = (
    (tousDeconsignes && STATUTS_DECONS_EQUIPE.includes(demande.statut)) ||
    (metiersEquipeDemande.length === 0 && demande.statut === 'consigne')
  ) && !demande.deconsignation_demandee;

  const dejaDemandeDecons = demande.deconsignation_demandee === 1 ||
    ['deconsigne_charge', 'deconsigne_process', 'deconsignee', 'cloturee'].includes(demande.statut);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.greenDark} />

      <View style={[S.header, { backgroundColor: COLORS.green }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.headerTitle}>{demande.numero_ordre}</Text>
          <Text style={S.headerSub}>Détail de la demande</Text>
        </View>
        <TouchableOpacity style={S.refreshBtn} onPress={chargerSilencieux}>
          <Ionicons name="refresh-outline" size={20} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: SPACE.base, paddingBottom: 60 }}>

        {/* Statut + TAG */}
        <View style={S.card}>
          <View style={S.cardTopRow}>
            <View style={[S.statutBadge, { backgroundColor: cfg.bg }]}>
              <Ionicons name={cfg.icon} size={14} color={cfg.color} />
              <Text style={[S.statutTxt, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
            <Text style={S.numeroOrdre}>{demande.numero_ordre}</Text>
          </View>
          <View style={S.tagBlock}>
            <View style={S.tagIconWrap}>
              <Ionicons name="hardware-chip-outline" size={22} color={COLORS.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.tagCode}>{demande.tag || demande.code_equipement || '—'}</Text>
              <Text style={S.tagNom}>{demande.equipement_nom || '—'}</Text>
              {demande.equipement_localisation && (
                <View style={S.tagLocRow}>
                  <Ionicons name="location-outline" size={12} color={COLORS.gray} />
                  <Text style={S.tagLoc}>{demande.equipement_localisation}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Bannière double-validation consignation */}
        {info.show && (
          <View style={[S.infoBanniere, { backgroundColor: info.bg, borderColor: info.color }]}>
            <Ionicons name={info.icon} size={18} color={info.color} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[S.infoBanniereTitle, { color: info.color }]}>{info.title}</Text>
              <Text style={[S.infoBanniereSub,   { color: info.color }]}>{info.sub}</Text>
            </View>
          </View>
        )}

        {/* Informations générales */}
        <View style={S.card}>
          <View style={S.sectionHeader}>
            <Ionicons name="information-circle-outline" size={18} color={COLORS.green} />
            <Text style={S.sectionTitle}>Informations générales</Text>
          </View>
          <InfoRow icon="folder-open-outline" label="LOT"            value={demande.lot_code || demande.lot || '—'} />
          <InfoRow icon="calendar-outline"    label="Date soumission" value={fmtDate(demande.created_at)} />
          {demande.demandeur_nom       && <InfoRow icon="person-outline" label="Demandeur" value={demande.demandeur_nom} />}
          {demande.demandeur_matricule && <InfoRow icon="card-outline"   label="Matricule"  value={demande.demandeur_matricule} />}
        </View>

        {/* Raison */}
        <View style={S.card}>
          <View style={S.sectionHeader}>
            <Ionicons name="document-text-outline" size={18} color={COLORS.green} />
            <Text style={S.sectionTitle}>Raison de l'intervention</Text>
          </View>
          <Text style={S.raisonText}>{demande.raison || '—'}</Text>
        </View>

        {/* Types intervenants */}
        {types.length > 0 && (
          <View style={S.card}>
            <View style={S.sectionHeader}>
              <Ionicons name="people-outline" size={18} color={COLORS.green} />
              <Text style={S.sectionTitle}>Types d'intervenants</Text>
            </View>
            <View style={S.typesGrid}>
              {types.map(k => {
                const t = TYPES_LABELS[k] || { label: k, icon: 'ellipse-outline', color: COLORS.gray, bg: COLORS.grayLight };
                return (
                  <View key={k} style={[S.typePill, { backgroundColor: t.bg }]}>
                    <Ionicons name={t.icon} size={14} color={t.color} />
                    <Text style={[S.typePillTxt, { color: t.color }]}>{t.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Motif rejet */}
        {demande.statut === 'rejetee' && demande.commentaire_rejet && (
          <View style={[S.card, { borderLeftWidth: 4, borderLeftColor: COLORS.statut.rejetee }]}>
            <View style={S.sectionHeader}>
              <Ionicons name="close-circle-outline" size={18} color={COLORS.statut.rejetee} />
              <Text style={[S.sectionTitle, { color: COLORS.statut.rejetee }]}>Motif de rejet</Text>
            </View>
            <View style={S.rejetBlock}>
              <Text style={S.rejetTxt}>{demande.commentaire_rejet}</Text>
            </View>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════
            TIMELINE — Suivi de la demande
        ══════════════════════════════════════════════════════════ */}
        <View style={S.card}>
          <View style={S.sectionHeader}>
            <Ionicons name="time-outline" size={18} color={COLORS.green} />
            <Text style={S.sectionTitle}>Suivi de la demande</Text>
          </View>

          <TimelineStep
            done
            icon="document-text-outline"
            label="Demande soumise"
            date={fmtDate(demande.created_at)}
            color={COLORS.green}
          />
          <TimelineStep
            done={['validee','en_cours','consigne_charge','consigne_process','consigne',
                   ...STATUTS_DECONS_EQUIPE,'deconsigne_charge','deconsigne_process','deconsignee','cloturee'].includes(demande.statut)}
            icon="checkmark-circle-outline"
            label="Demande validée"
            color={COLORS.green}
          />
          <TimelineStep
            done={['en_cours','consigne_charge','consigne_process','consigne',
                   ...STATUTS_DECONS_EQUIPE,'deconsigne_charge','deconsigne_process','deconsignee','cloturee'].includes(demande.statut)}
            icon="sync-outline"
            label="Consignation en cours"
            color={COLORS.statut.en_cours}
          />
          <TimelineStep
            done={['consigne_charge','consigne',...STATUTS_DECONS_EQUIPE,'deconsigne_charge',
                   'deconsigne_process','deconsignee','cloturee'].includes(demande.statut)}
            icon="flash-outline"
            label="Points électriques validés"
            date={['consigne_charge','consigne',...STATUTS_DECONS_EQUIPE,'deconsigne_charge',
                   'deconsigne_process','deconsignee','cloturee'].includes(demande.statut)
              ? fmtDate(demande.date_validation_charge) : null}
            color="#1d4ed8"
            subLabel={demande.statut === 'consigne_charge' ? '⏳ En attente du process' : undefined}
          />
          <TimelineStep
            done={['consigne_process','consigne',...STATUTS_DECONS_EQUIPE,'deconsigne_charge',
                   'deconsigne_process','deconsignee','cloturee'].includes(demande.statut)}
            icon="cog-outline"
            label="Points process validés"
            date={['consigne_process','consigne',...STATUTS_DECONS_EQUIPE,'deconsigne_charge',
                   'deconsigne_process','deconsignee','cloturee'].includes(demande.statut)
              ? fmtDate(demande.date_validation_process) : null}
            color="#b45309"
            subLabel={demande.statut === 'consigne_process' ? '⏳ En attente du chargé' : undefined}
          />
          <TimelineStep
            done={STATUTS_APRES_CONSIGNE.includes(demande.statut)}
            icon="lock-closed-outline"
            label="Équipement consigné — Intervention autorisée"
            date={STATUTS_APRES_CONSIGNE.includes(demande.statut)
              ? fmtDate(demande.date_validation || demande.updated_at) : null}
            color={COLORS.green}
            last={!afficherDeconsignation || metiersEquipeDemande.length === 0}
          />

          {/* Steps déconsignation par métier */}
          {afficherDeconsignation && metiersEquipeDemande.map((metier, index) => {
            const config = DECONSIG_METIER_CONFIG[metier] || { label: `Déconsignation ${metier}`, icon: 'unlock-outline', color: COLORS.gray };
            const etat   = deconParMetier[metier];
            const fait   = etat?.fait === true;
            const heure  = etat?.heure || null;
            const total  = etat?.total  || 0;
            const sortis = etat?.sortis || 0;
            const isLast = index === metiersEquipeDemande.length - 1 &&
              !['deconsigne_charge','deconsigne_process','deconsignee','cloturee'].includes(demande.statut);

            let subLabel;
            if (!fait && total > 0) {
              subLabel = `${sortis}/${total} membre${total > 1 ? 's' : ''} sorti${sortis > 1 ? 's' : ''}`;
            } else if (!fait && total === 0) {
              subLabel = '⏳ En attente de l\'équipe';
            }

            return (
              <TimelineStep
                key={metier}
                done={fait}
                icon={config.icon}
                label={config.label}
                date={fait ? fmtDate(heure) : null}
                color={config.color}
                subLabel={subLabel}
                last={isLast}
              />
            );
          })}

          {/* Step déconsignation chargé */}
          {['deconsigne_charge','deconsigne_process','deconsignee','cloturee'].includes(demande.statut) && (
            <TimelineStep
              done={['deconsigne_charge','deconsignee','cloturee'].includes(demande.statut)}
              icon="flash-outline"
              label="Déconsignation électrique validée"
              color="#1d4ed8"
              subLabel={demande.statut === 'deconsigne_process' ? '⏳ En attente du chargé' : undefined}
              last={false}
            />
          )}

          {/* Step déconsignation process */}
          {types.includes('process') && ['deconsigne_charge','deconsigne_process','deconsignee','cloturee'].includes(demande.statut) && (
            <TimelineStep
              done={['deconsigne_process','deconsignee','cloturee'].includes(demande.statut)}
              icon="cog-outline"
              label="Déconsignation process validée"
              color="#b45309"
              subLabel={demande.statut === 'deconsigne_charge' ? '⏳ En attente du process' : undefined}
              last={false}
            />
          )}

          {/* Step final déconsignation complète */}
          {afficherDeconsignation && (
            <TimelineStep
              done={['deconsignee', 'cloturee'].includes(demande.statut)}
              icon="unlock-outline"
              label="Équipement déconsigné — Intervention terminée"
              date={['deconsignee', 'cloturee'].includes(demande.statut)
                ? fmtDate(demande.updated_at) : null}
              color={COLORS.statut.deconsignee || '#7C3AED'}
              last
            />
          )}
        </View>

        {/* ══════════════════════════════════════════════════════════
            ✅ NOUVEAU — Bouton "Demander la déconsignation"
            Affiché quand tous les métiers ont terminé
        ══════════════════════════════════════════════════════════ */}
        {peutDemanderDecons && (
          <TouchableOpacity
            style={[S.demandeDeconBtn, envoyiDecons && { opacity: 0.7 }]}
            onPress={envoyerDemandeDeconsignation}
            activeOpacity={0.8}
            disabled={envoyiDecons}
          >
            <View style={S.demandeDeconIconWrap}>
              {envoyiDecons
                ? <ActivityIndicator size="small" color="#7C3AED" />
                : <Ionicons name="unlock-outline" size={24} color="#7C3AED" />
              }
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.demandeDeconTitre}>Demander la déconsignation</Text>
              <Text style={S.demandeDeconSub}>
                Toutes les équipes ont quitté — Notifier le chargé et le process
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#7C3AED" />
          </TouchableOpacity>
        )}

        {/* Bannière si déjà demandée */}
        {dejaDemandeDecons && !['deconsignee','cloturee'].includes(demande.statut) &&
          demande.statut !== 'consigne' && (
          <View style={[S.infoBanniere, { backgroundColor: '#EDE9FE', borderColor: '#7C3AED' }]}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#7C3AED" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[S.infoBanniereTitle, { color: '#7C3AED' }]}>Déconsignation demandée</Text>
              <Text style={[S.infoBanniereSub,   { color: '#7C3AED' }]}>
                Le chargé et le process ont été notifiés. En attente de leur validation.
              </Text>
            </View>
          </View>
        )}

        {/* Bouton PDF */}
        {hasPdf(demande.statut) && (
          <TouchableOpacity style={S.pdfBtn} onPress={ouvrirPDF} activeOpacity={0.8}>
            <View style={S.pdfIconWrap}>
              <Ionicons name="document-text" size={22} color={COLORS.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.pdfTitre}>Fiche de consignation PDF</Text>
              <Text style={S.pdfSub}>F-HSE-SEC-22-01 — Ouvrir dans l'application</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.green} />
          </TouchableOpacity>
        )}

      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <View style={S.infoRow}>
      <View style={S.infoIconWrap}>
        <Ionicons name={icon} size={15} color={COLORS.green} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={S.infoLabel}>{label}</Text>
        <Text style={S.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function TimelineStep({ done, icon, label, date, color, last, subLabel }) {
  return (
    <View style={S.timelineStep}>
      <View style={S.timelineLeft}>
        <View style={[S.timelineDot, done
          ? { backgroundColor: color, borderColor: color }
          : { backgroundColor: COLORS.grayLight, borderColor: COLORS.grayMedium }
        ]}>
          <Ionicons name={icon} size={12} color={done ? COLORS.white : COLORS.gray} />
        </View>
        {!last && <View style={[S.timelineLine, done && { backgroundColor: color }]} />}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : SPACE.md }}>
        <Text style={[S.timelineLabel, done && { color: COLORS.grayDeep, fontWeight: FONTS.weight.semibold }]}>
          {label}
        </Text>
        {subLabel && <Text style={[S.timelineDate, { color, fontStyle: 'italic' }]}>{subLabel}</Text>}
        {date     && <Text style={S.timelineDate}>{date}</Text>}
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  header: {
    paddingTop: 50, paddingBottom: 14,
    paddingHorizontal: SPACE.base,
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
  },
  backBtn: {
    width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center',
  },
  refreshBtn: {
    width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: COLORS.white, fontSize: FONTS.size.lg, fontWeight: FONTS.weight.bold },
  headerSub:   { color: 'rgba(255,255,255,0.7)', fontSize: FONTS.size.xs, marginTop: 1 },

  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    padding: SPACE.base, marginBottom: SPACE.md, ...SHADOW.sm,
  },
  cardTopRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: SPACE.md,
  },
  statutBadge: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.xs,
    borderRadius: RADIUS.full, paddingHorizontal: SPACE.md, paddingVertical: SPACE.xs,
  },
  statutTxt:   { fontSize: FONTS.size.xs, fontWeight: FONTS.weight.bold, letterSpacing: 0.5 },
  numeroOrdre: { fontSize: FONTS.size.sm, fontWeight: FONTS.weight.extrabold, color: COLORS.grayDark },

  tagBlock: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md,
    backgroundColor: COLORS.greenPale, borderRadius: RADIUS.md, padding: SPACE.md,
  },
  tagIconWrap: {
    width: 44, height: 44, borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center',
  },
  tagCode: { fontSize: FONTS.size.lg, fontWeight: FONTS.weight.extrabold, color: COLORS.green },
  tagNom:  { fontSize: FONTS.size.sm, color: COLORS.grayDark, marginTop: 2 },
  tagLocRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  tagLoc:    { fontSize: FONTS.size.xs, color: COLORS.gray },

  infoBanniere: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderRadius: RADIUS.lg, padding: SPACE.base, marginBottom: SPACE.md, borderWidth: 1,
  },
  infoBanniereTitle: { fontSize: FONTS.size.sm, fontWeight: FONTS.weight.bold, marginBottom: 2 },
  infoBanniereSub:   { fontSize: FONTS.size.xs, lineHeight: 16 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    marginBottom: SPACE.md, paddingBottom: SPACE.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.grayLight,
  },
  sectionTitle: { fontSize: FONTS.size.sm, fontWeight: FONTS.weight.bold, color: COLORS.grayDeep },

  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm, marginBottom: SPACE.sm },
  infoIconWrap: {
    width: 30, height: 30, borderRadius: RADIUS.sm,
    backgroundColor: COLORS.greenPale, alignItems: 'center', justifyContent: 'center',
  },
  infoLabel: { fontSize: FONTS.size.xs, color: COLORS.gray },
  infoValue: { fontSize: FONTS.size.sm, fontWeight: FONTS.weight.semibold, color: COLORS.grayDeep, marginTop: 1 },

  raisonText: {
    fontSize: FONTS.size.sm, color: COLORS.grayDark, lineHeight: 22,
    backgroundColor: COLORS.grayPale, borderRadius: RADIUS.md, padding: SPACE.md,
  },
  typesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  typePill: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.xs,
    borderRadius: RADIUS.full, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm,
  },
  typePillTxt: { fontSize: FONTS.size.xs, fontWeight: FONTS.weight.bold },

  rejetBlock: { backgroundColor: '#FFEBEE', borderRadius: RADIUS.md, padding: SPACE.md },
  rejetTxt:   { fontSize: FONTS.size.sm, color: COLORS.statut.rejetee, lineHeight: 20 },

  timelineStep: { flexDirection: 'row', gap: SPACE.md },
  timelineLeft: { alignItems: 'center', width: 28 },
  timelineDot: {
    width: 28, height: 28, borderRadius: RADIUS.full,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  timelineLine: {
    flex: 1, width: 2, backgroundColor: COLORS.grayMedium, marginTop: 2, marginBottom: 2,
  },
  timelineLabel: { fontSize: FONTS.size.sm, color: COLORS.gray, paddingTop: SPACE.xs },
  timelineDate:  { fontSize: FONTS.size.xs, color: COLORS.gray, marginTop: 2 },

  // ✅ NOUVEAU — Bouton demande déconsignation
  demandeDeconBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#EDE9FE',
    borderRadius: RADIUS.lg, padding: SPACE.base, gap: SPACE.md,
    borderWidth: 1.5, borderColor: '#7C3AED', marginBottom: SPACE.md, ...SHADOW.sm,
  },
  demandeDeconIconWrap: {
    width: 48, height: 48, borderRadius: RADIUS.md,
    backgroundColor: '#DDD6FE', alignItems: 'center', justifyContent: 'center',
  },
  demandeDeconTitre: { fontSize: FONTS.size.sm, fontWeight: FONTS.weight.bold, color: '#5B21B6' },
  demandeDeconSub:   { fontSize: FONTS.size.xs, color: '#7C3AED', marginTop: 2, lineHeight: 16 },

  pdfBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.greenPale,
    borderRadius: RADIUS.lg, padding: SPACE.base, gap: SPACE.md,
    borderWidth: 1, borderColor: '#A5D6A7', ...SHADOW.sm,
  },
  pdfIconWrap: {
    width: 44, height: 44, borderRadius: RADIUS.md,
    backgroundColor: '#C8E6C9', alignItems: 'center', justifyContent: 'center',
  },
  pdfTitre: { fontSize: FONTS.size.sm, fontWeight: FONTS.weight.bold, color: COLORS.green },
  pdfSub:   { fontSize: FONTS.size.xs, color: COLORS.greenLight, marginTop: 2 },

  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, backgroundColor: COLORS.green,
    borderRadius: RADIUS.lg, paddingHorizontal: SPACE.xl, paddingVertical: SPACE.md, marginTop: SPACE.lg,
  },
  retryBtnTxt: { color: COLORS.white, fontSize: FONTS.size.md, fontWeight: FONTS.weight.bold },
});