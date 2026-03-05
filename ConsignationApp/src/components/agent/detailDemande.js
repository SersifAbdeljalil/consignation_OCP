// src/components/agent/detailDemande.js
// ✅ Auto-refresh toutes les 15s — mise à jour en temps réel sans quitter la page
// ✅ Dates au format dd/mm/yyyy à hh:mm:ss

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StatusBar, ActivityIndicator, StyleSheet, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACE, RADIUS, SHADOW } from '../../styles/variables.css';
import { getDemandeById } from '../../api/demande.api';
import { API_URL } from '../../api/client';

const REFRESH_INTERVAL_MS = 15000; // 15 secondes

// ── Config statuts ─────────────────────────────
const STATUT_CONFIG = {
  en_attente:       { color: COLORS.statut.en_attente,  bg: '#FFF8E1',        label: 'EN ATTENTE',        icon: 'time-outline'              },
  validee:          { color: COLORS.statut.validee,     bg: COLORS.greenPale, label: 'VALIDÉE',           icon: 'checkmark-circle-outline'  },
  rejetee:          { color: COLORS.statut.rejetee,     bg: '#FFEBEE',        label: 'REJETÉE',           icon: 'close-circle-outline'      },
  en_cours:         { color: COLORS.statut.en_cours,    bg: COLORS.bluePale,  label: 'EN COURS',          icon: 'sync-outline'              },
  consigne_charge:  { color: '#1d4ed8',                 bg: '#dbeafe',        label: 'CONSIG. EN COURS',  icon: 'time-outline'              },
  consigne_process: { color: '#b45309',                 bg: '#fde68a',        label: 'CONSIG. EN COURS',  icon: 'time-outline'              },
  consigne:         { color: COLORS.statut.validee,     bg: '#D1FAE5',        label: 'CONSIGNÉ',          icon: 'lock-closed-outline'       },
  deconsignee:      { color: COLORS.statut.deconsignee, bg: '#F3E5F5',        label: 'DÉCONSIGNÉE',       icon: 'unlock-outline'            },
  cloturee:         { color: COLORS.statut.cloturee,    bg: COLORS.grayLight, label: 'CLÔTURÉE',          icon: 'archive-outline'           },
};

const TYPES_LABELS = {
  genie_civil: { label: 'Génie Civil',  icon: 'business-outline',      color: '#7C3AED', bg: '#EDE9FE' },
  mecanique:   { label: 'Mécanique',    icon: 'settings-outline',       color: '#D97706', bg: '#FEF3C7' },
  electrique:  { label: 'Électrique',   icon: 'flash-outline',          color: COLORS.statut.en_cours, bg: COLORS.bluePale },
  process:     { label: 'Process',      icon: 'git-branch-outline',     color: '#059669', bg: '#D1FAE5' },
};

// ✅ Format dd/mm/yyyy à hh:mm:ss
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} à ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
};

const hasPdf = (statut) => statut === 'consigne' || statut === 'cloturee';

const getConsignationInfo = (statut) => {
  if (statut === 'consigne_charge') {
    return {
      show: true,
      icon: 'flash-outline',
      color: '#1d4ed8',
      bg: '#dbeafe',
      title: 'Consignation électrique effectuée',
      sub: 'En attente de la validation du chef process pour finaliser.',
    };
  }
  if (statut === 'consigne_process') {
    return {
      show: true,
      icon: 'cog-outline',
      color: '#b45309',
      bg: '#fde68a',
      title: 'Consignation process effectuée',
      sub: 'En attente de la validation du chargé de consignation pour finaliser.',
    };
  }
  return { show: false };
};

export default function DetailDemande({ navigation, route }) {
  const demandeParam = route.params?.demande;
  const [demande,       setDemande]       = useState(demandeParam || null);
  const [loading,       setLoading]       = useState(!demandeParam?.equipement_nom);
  const [erreur,        setErreur]        = useState(null);
  const [lastRefresh,   setLastRefresh]   = useState(null);
  const [refreshing,    setRefreshing]    = useState(false);

  const intervalRef    = useRef(null);
  const isMountedRef   = useRef(true);
  const prevStatutRef  = useRef(demandeParam?.statut);

  // ── Charger / rafraîchir la demande ──────────────────────────────
  const charger = useCallback(async (silencieux = false) => {
    if (!demandeParam?.id) {
      setErreur('Identifiant de demande manquant');
      setLoading(false);
      return;
    }
    if (!silencieux) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await getDemandeById(demandeParam.id);
      if (!isMountedRef.current) return;

      if (res?.success) {
        const nouvelleData = res.data;

        // ✅ Notifier si le statut a changé depuis le dernier refresh
        if (
          prevStatutRef.current &&
          prevStatutRef.current !== nouvelleData.statut
        ) {
          const cfg = STATUT_CONFIG[nouvelleData.statut];
          Alert.alert(
            '🔄 Statut mis à jour',
            `La demande est maintenant : ${cfg?.label || nouvelleData.statut}`,
            [{ text: 'OK' }]
          );
        }
        prevStatutRef.current = nouvelleData.statut;
        setDemande(nouvelleData);
        setLastRefresh(new Date());
        setErreur(null);
      } else {
        if (!silencieux) setErreur(res?.message || 'Impossible de charger la demande');
      }
    } catch (e) {
      if (!isMountedRef.current) return;
      if (!silencieux) setErreur('Erreur de connexion. Vérifiez votre réseau.');
    } finally {
      if (!isMountedRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [demandeParam?.id]);

  // ── Chargement initial ────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;

    if (!demandeParam?.equipement_nom || !demandeParam?.raison) {
      charger(false);
    } else {
      setLoading(false);
      setLastRefresh(new Date());
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [charger]);

  // ✅ Auto-refresh toutes les 15 secondes
  useEffect(() => {
    // Ne pas rafraîchir si la demande est terminée
    const statutsFinaux = ['cloturee', 'rejetee', 'deconsignee'];
    if (demande && statutsFinaux.includes(demande.statut)) return;

    intervalRef.current = setInterval(() => {
      charger(true); // silencieux = true → pas de spinner plein écran
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [charger, demande?.statut]);

  const ouvrirPDF = () => {
    navigation.navigate('PdfViewer', {
      url:   `${API_URL}/charge/demandes/${demande.id}/pdf`,
      titre: demande.numero_ordre,
    });
  };

  // ── Format heure dernière MAJ ─────────────────────────────────────
  const fmtHeure = (d) => {
    if (!d) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  // ── États de chargement ───────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.green} />
        <Text style={{ color: COLORS.gray, marginTop: SPACE.md, fontSize: FONTS.size.sm }}>
          Chargement de la demande...
        </Text>
      </View>
    );
  }

  if (erreur || !demande) {
    return (
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
          <TouchableOpacity style={S.retryBtn} onPress={() => charger(false)}>
            <Ionicons name="refresh-outline" size={18} color={COLORS.white} />
            <Text style={S.retryBtnTxt}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const cfg   = STATUT_CONFIG[demande.statut] || STATUT_CONFIG.en_attente;
  const types = Array.isArray(demande.types_intervenants) ? demande.types_intervenants : [];
  const info  = getConsignationInfo(demande.statut);

  // ✅ Ne pas afficher l'indicateur de refresh pour les statuts finaux
  const statutsFinaux = ['cloturee', 'rejetee', 'deconsignee'];
  const autoRefreshActif = !statutsFinaux.includes(demande.statut);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.greenDark} />

      {/* Header */}
      <View style={[S.header, { backgroundColor: COLORS.green }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.headerTitle}>{demande.numero_ordre}</Text>
          <Text style={S.headerSub}>Détail de la demande</Text>
        </View>
        {/* ✅ Bouton refresh manuel */}
        <TouchableOpacity
          style={S.refreshBtn}
          onPress={() => charger(true)}
          disabled={refreshing}
        >
          {refreshing
            ? <ActivityIndicator size="small" color={COLORS.white} />
            : <Ionicons name="refresh-outline" size={20} color={COLORS.white} />
          }
        </TouchableOpacity>
      </View>

      {/* ✅ Bandeau auto-refresh */}
      {autoRefreshActif && (
        <View style={S.refreshBandeau}>
          <View style={S.refreshDot} />
          <Text style={S.refreshBandeauTxt}>
            Mise à jour automatique toutes les 15s
            {lastRefresh ? ` — dernière : ${fmtHeure(lastRefresh)}` : ''}
          </Text>
        </View>
      )}

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

        {/* Bannière double-validation */}
        {info.show && (
          <View style={[S.infoBanniere, { backgroundColor: info.bg, borderColor: info.color }]}>
            <Ionicons name={info.icon} size={18} color={info.color} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[S.infoBanniereTitle, { color: info.color }]}>{info.title}</Text>
              <Text style={[S.infoBanniereSub, { color: info.color }]}>{info.sub}</Text>
            </View>
          </View>
        )}

        {/* Informations générales */}
        <View style={S.card}>
          <View style={S.sectionHeader}>
            <Ionicons name="information-circle-outline" size={18} color={COLORS.green} />
            <Text style={S.sectionTitle}>Informations générales</Text>
          </View>
          <InfoRow icon="folder-open-outline"  label="LOT"            value={demande.lot_code || demande.lot || '—'} />
          <InfoRow icon="calendar-outline"      label="Date soumission" value={fmtDate(demande.created_at)} />
          {demande.demandeur_nom && (
            <InfoRow icon="person-outline"      label="Demandeur"      value={demande.demandeur_nom} />
          )}
          {demande.demandeur_matricule && (
            <InfoRow icon="card-outline"        label="Matricule"      value={demande.demandeur_matricule} />
          )}
        </View>

        {/* Raison / Motif */}
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

        {/* ✅ Timeline avec dates hh:mm:ss */}
        <View style={S.card}>
          <View style={S.sectionHeader}>
            <Ionicons name="time-outline" size={18} color={COLORS.green} />
            <Text style={S.sectionTitle}>Suivi de la demande</Text>
          </View>

          <TimelineStep
            done={true}
            icon="document-text-outline"
            label="Demande soumise"
            date={fmtDate(demande.created_at)}
            color={COLORS.green}
          />
          <TimelineStep
            done={['validee','en_cours','consigne_charge','consigne_process','consigne','cloturee'].includes(demande.statut)}
            icon="checkmark-circle-outline"
            label="Demande validée"
            color={COLORS.green}
          />
          <TimelineStep
            done={['en_cours','consigne_charge','consigne_process','consigne','cloturee'].includes(demande.statut)}
            icon="sync-outline"
            label="Consignation en cours"
            color={COLORS.statut.en_cours}
          />
          <TimelineStep
            done={['consigne_charge','consigne','cloturee'].includes(demande.statut)}
            icon="flash-outline"
            label="Points électriques validés"
            date={
              ['consigne_charge','consigne','cloturee'].includes(demande.statut)
                ? fmtDate(demande.date_validation_charge)
                : null
            }
            color="#1d4ed8"
            subLabel={demande.statut === 'consigne_charge' ? '⏳ En attente du process' : undefined}
          />
          <TimelineStep
            done={['consigne_process','consigne','cloturee'].includes(demande.statut)}
            icon="cog-outline"
            label="Points process validés"
            date={
              ['consigne_process','consigne','cloturee'].includes(demande.statut)
                ? fmtDate(demande.date_validation_process)
                : null
            }
            color="#b45309"
            subLabel={demande.statut === 'consigne_process' ? '⏳ En attente du chargé' : undefined}
          />
          <TimelineStep
            done={['consigne','cloturee'].includes(demande.statut)}
            icon="lock-closed-outline"
            label="Équipement consigné — PDF disponible"
            date={
              ['consigne','cloturee'].includes(demande.statut)
                ? fmtDate(demande.date_validation || demande.updated_at)
                : null
            }
            color={COLORS.green}
            last={true}
          />
        </View>

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
        {subLabel && (
          <Text style={[S.timelineDate, { color, fontStyle: 'italic' }]}>{subLabel}</Text>
        )}
        {date && <Text style={S.timelineDate}>{date}</Text>}
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  header: {
    paddingTop: 50, paddingBottom: 14,
    paddingHorizontal: SPACE.base,
    flexDirection: 'row', alignItems: 'center',
    gap: SPACE.sm,
  },
  backBtn: {
    width: 36, height: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  refreshBtn: {
    width: 36, height: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: COLORS.white, fontSize: FONTS.size.lg, fontWeight: FONTS.weight.bold },
  headerSub:   { color: 'rgba(255,255,255,0.7)', fontSize: FONTS.size.xs, marginTop: 1 },

  // ✅ Bandeau auto-refresh
  refreshBandeau: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: SPACE.base, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: '#A5D6A7',
  },
  refreshDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: COLORS.green,
  },
  refreshBandeauTxt: {
    fontSize: FONTS.size.xs, color: COLORS.green, fontWeight: FONTS.weight.semibold,
  },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.base,
    marginBottom: SPACE.md,
    ...SHADOW.sm,
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
    backgroundColor: COLORS.greenPale,
    borderRadius: RADIUS.md, padding: SPACE.md,
  },
  tagIconWrap: {
    width: 44, height: 44, borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  tagCode: { fontSize: FONTS.size.lg, fontWeight: FONTS.weight.extrabold, color: COLORS.green },
  tagNom:  { fontSize: FONTS.size.sm, color: COLORS.grayDark, marginTop: 2 },
  tagLocRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  tagLoc:    { fontSize: FONTS.size.xs, color: COLORS.gray },

  infoBanniere: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderRadius: RADIUS.lg, padding: SPACE.base,
    marginBottom: SPACE.md, borderWidth: 1,
  },
  infoBanniereTitle: { fontSize: FONTS.size.sm, fontWeight: FONTS.weight.bold, marginBottom: 2 },
  infoBanniereSub:   { fontSize: FONTS.size.xs, lineHeight: 16 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    marginBottom: SPACE.md,
    paddingBottom: SPACE.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.grayLight,
  },
  sectionTitle: { fontSize: FONTS.size.sm, fontWeight: FONTS.weight.bold, color: COLORS.grayDeep },

  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: SPACE.sm, marginBottom: SPACE.sm,
  },
  infoIconWrap: {
    width: 30, height: 30, borderRadius: RADIUS.sm,
    backgroundColor: COLORS.greenPale,
    alignItems: 'center', justifyContent: 'center',
  },
  infoLabel: { fontSize: FONTS.size.xs, color: COLORS.gray },
  infoValue: { fontSize: FONTS.size.sm, fontWeight: FONTS.weight.semibold, color: COLORS.grayDeep, marginTop: 1 },

  raisonText: {
    fontSize: FONTS.size.sm, color: COLORS.grayDark,
    lineHeight: 22, backgroundColor: COLORS.grayPale,
    borderRadius: RADIUS.md, padding: SPACE.md,
  },

  typesGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
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
    flex: 1, width: 2, backgroundColor: COLORS.grayMedium,
    marginTop: 2, marginBottom: 2,
  },
  timelineLabel: { fontSize: FONTS.size.sm, color: COLORS.gray, paddingTop: SPACE.xs },
  timelineDate:  { fontSize: FONTS.size.xs, color: COLORS.gray, marginTop: 2 },

  pdfBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.greenPale,
    borderRadius: RADIUS.lg, padding: SPACE.base,
    gap: SPACE.md, borderWidth: 1, borderColor: '#A5D6A7',
    ...SHADOW.sm,
  },
  pdfIconWrap: {
    width: 44, height: 44, borderRadius: RADIUS.md,
    backgroundColor: '#C8E6C9',
    alignItems: 'center', justifyContent: 'center',
  },
  pdfTitre: { fontSize: FONTS.size.sm,  fontWeight: FONTS.weight.bold, color: COLORS.green },
  pdfSub:   { fontSize: FONTS.size.xs, color: COLORS.greenLight, marginTop: 2 },

  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    backgroundColor: COLORS.green, borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.xl, paddingVertical: SPACE.md,
    marginTop: SPACE.lg,
  },
  retryBtnTxt: { color: COLORS.white, fontSize: FONTS.size.md, fontWeight: FONTS.weight.bold },
});