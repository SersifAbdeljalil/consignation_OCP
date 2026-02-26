// src/components/agent/detailDemande.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StatusBar, ActivityIndicator, StyleSheet, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACE, RADIUS, SHADOW } from '../../styles/variables.css';
import { getDemandeById } from '../../api/demande.api';
import { API_URL } from '../../api/client';

// ── Config statuts ─────────────────────────────
const STATUT_CONFIG = {
  en_attente:  { color: COLORS.statut.en_attente,  bg: '#FFF8E1',        label: 'EN ATTENTE',   icon: 'time-outline'              },
  validee:     { color: COLORS.statut.validee,     bg: COLORS.greenPale, label: 'VALIDÉE',      icon: 'checkmark-circle-outline'  },
  rejetee:     { color: COLORS.statut.rejetee,     bg: '#FFEBEE',        label: 'REJETÉE',      icon: 'close-circle-outline'      },
  en_cours:    { color: COLORS.statut.en_cours,    bg: COLORS.bluePale,  label: 'EN COURS',     icon: 'sync-outline'              },
  consigne:    { color: COLORS.statut.validee,     bg: '#D1FAE5',        label: 'CONSIGNÉ',     icon: 'lock-closed-outline'       },
  deconsignee: { color: COLORS.statut.deconsignee, bg: '#F3E5F5',        label: 'DÉCONSIGNÉE',  icon: 'unlock-outline'            },
  cloturee:    { color: COLORS.statut.cloturee,    bg: COLORS.grayLight, label: 'CLÔTURÉE',     icon: 'archive-outline'           },
};

const TYPES_LABELS = {
  genie_civil: { label: 'Génie Civil',  icon: 'business-outline',      color: '#7C3AED', bg: '#EDE9FE' },
  mecanique:   { label: 'Mécanique',    icon: 'settings-outline',       color: '#D97706', bg: '#FEF3C7' },
  electrique:  { label: 'Électrique',   icon: 'flash-outline',          color: COLORS.statut.en_cours, bg: COLORS.bluePale },
  process:     { label: 'Process',      icon: 'git-branch-outline',     color: '#059669', bg: '#D1FAE5' },
};

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()} à ${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`;
};

const hasPdf = (statut) => statut === 'consigne' || statut === 'cloturee';

export default function DetailDemande({ navigation, route }) {
  const demandeParam = route.params?.demande;
  const [demande,  setDemande]  = useState(demandeParam || null);
  const [loading,  setLoading]  = useState(!demandeParam?.equipement_nom);
  const [erreur,   setErreur]   = useState(null);

  // ── Charger le détail complet si besoin ───────
  const charger = useCallback(async () => {
    if (!demandeParam?.id) {
      setErreur('Identifiant de demande manquant');
      setLoading(false);
      return;
    }
    try {
      const res = await getDemandeById(demandeParam.id);
      if (res?.success) {
        setDemande(res.data);
      } else {
        setErreur(res?.message || 'Impossible de charger la demande');
      }
    } catch (e) {
      setErreur('Erreur de connexion. Vérifiez votre réseau.');
    } finally {
      setLoading(false);
    }
  }, [demandeParam?.id]);

  useEffect(() => {
    // Charger le détail complet si on n'a que l'ID ou des données partielles
    if (!demandeParam?.equipement_nom || !demandeParam?.raison) {
      charger();
    } else {
      setLoading(false);
    }
  }, [charger]);

  const ouvrirPDF = () => {
    navigation.navigate('PdfViewer', {
      url:   `${API_URL}/charge/demandes/${demande.id}/pdf`,
      titre: demande.numero_ordre,
    });
  };

  // ── Chargement ────────────────────────────────
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

  // ── Erreur ────────────────────────────────────
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
          <TouchableOpacity style={S.retryBtn} onPress={charger}>
            <Ionicons name="refresh-outline" size={18} color={COLORS.white} />
            <Text style={S.retryBtnTxt}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const cfg   = STATUT_CONFIG[demande.statut] || STATUT_CONFIG.en_attente;
  const types = Array.isArray(demande.types_intervenants) ? demande.types_intervenants : [];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.greenDark} />

      {/* ── Header ── */}
      <View style={[S.header, { backgroundColor: COLORS.green }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.headerTitle}>{demande.numero_ordre}</Text>
          <Text style={S.headerSub}>Détail de la demande</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: SPACE.base, paddingBottom: 60 }}>

        {/* ── Statut + TAG ── */}
        <View style={S.card}>
          <View style={S.cardTopRow}>
            {/* Statut badge */}
            <View style={[S.statutBadge, { backgroundColor: cfg.bg }]}>
              <Ionicons name={cfg.icon} size={14} color={cfg.color} />
              <Text style={[S.statutTxt, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
            {/* N° ordre */}
            <Text style={S.numeroOrdre}>{demande.numero_ordre}</Text>
          </View>

          {/* TAG + équipement */}
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

        {/* ── Informations générales ── */}
        <View style={S.card}>
          <View style={S.sectionHeader}>
            <Ionicons name="information-circle-outline" size={18} color={COLORS.green} />
            <Text style={S.sectionTitle}>Informations générales</Text>
          </View>

          <InfoRow icon="folder-open-outline"  label="LOT"        value={demande.lot_code || demande.lot || '—'} />
          <InfoRow icon="calendar-outline"      label="Date soumission" value={fmtDate(demande.created_at)} />
          {demande.demandeur_nom && (
            <InfoRow icon="person-outline"      label="Demandeur"  value={demande.demandeur_nom} />
          )}
          {demande.demandeur_matricule && (
            <InfoRow icon="card-outline"        label="Matricule"  value={demande.demandeur_matricule} />
          )}
        </View>

        {/* ── Raison / Motif ── */}
        <View style={S.card}>
          <View style={S.sectionHeader}>
            <Ionicons name="document-text-outline" size={18} color={COLORS.green} />
            <Text style={S.sectionTitle}>Raison de l'intervention</Text>
          </View>
          <Text style={S.raisonText}>{demande.raison || '—'}</Text>
        </View>

        {/* ── Types intervenants ── */}
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

        {/* ── Motif rejet si rejetée ── */}
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

        {/* ── Timeline statut ── */}
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
            done={['validee','en_cours','consigne','cloturee'].includes(demande.statut)}
            icon="checkmark-circle-outline"
            label="Demande validée"
            color={COLORS.green}
          />
          <TimelineStep
            done={['en_cours','consigne','cloturee'].includes(demande.statut)}
            icon="sync-outline"
            label="Consignation en cours"
            color={COLORS.statut.en_cours}
          />
          <TimelineStep
            done={['consigne','cloturee'].includes(demande.statut)}
            icon="lock-closed-outline"
            label="Équipement consigné"
            date={demande.statut === 'consigne' || demande.statut === 'cloturee' ? fmtDate(demande.updated_at) : null}
            color={COLORS.green}
            last={true}
          />
        </View>

        {/* ── Bouton PDF si disponible ── */}
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

// ── Composant ligne d'info ────────────────────
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

// ── Composant étape timeline ──────────────────
function TimelineStep({ done, icon, label, date, color, last }) {
  return (
    <View style={S.timelineStep}>
      {/* Ligne verticale */}
      <View style={S.timelineLeft}>
        <View style={[S.timelineDot, done
          ? { backgroundColor: color, borderColor: color }
          : { backgroundColor: COLORS.grayLight, borderColor: COLORS.grayMedium }
        ]}>
          <Ionicons name={icon} size={12} color={done ? COLORS.white : COLORS.gray} />
        </View>
        {!last && <View style={[S.timelineLine, done && { backgroundColor: color }]} />}
      </View>
      {/* Texte */}
      <View style={{ flex: 1, paddingBottom: last ? 0 : SPACE.md }}>
        <Text style={[S.timelineLabel, done && { color: COLORS.grayDeep, fontWeight: FONTS.weight.semibold }]}>
          {label}
        </Text>
        {date && <Text style={S.timelineDate}>{date}</Text>}
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  // ── Header ──────────────────────────────────
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
  headerTitle: { color: COLORS.white, fontSize: FONTS.size.lg, fontWeight: FONTS.weight.bold },
  headerSub:   { color: 'rgba(255,255,255,0.7)', fontSize: FONTS.size.xs, marginTop: 1 },

  // ── Card générique ───────────────────────────
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

  // ── Statut ───────────────────────────────────
  statutBadge: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.xs,
    borderRadius: RADIUS.full, paddingHorizontal: SPACE.md, paddingVertical: SPACE.xs,
  },
  statutTxt:   { fontSize: FONTS.size.xs, fontWeight: FONTS.weight.bold, letterSpacing: 0.5 },
  numeroOrdre: { fontSize: FONTS.size.sm, fontWeight: FONTS.weight.extrabold, color: COLORS.grayDark },

  // ── TAG bloc ─────────────────────────────────
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

  // ── Section header ────────────────────────────
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    marginBottom: SPACE.md,
    paddingBottom: SPACE.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.grayLight,
  },
  sectionTitle: {
    fontSize: FONTS.size.sm, fontWeight: FONTS.weight.bold, color: COLORS.grayDeep,
  },

  // ── Info row ─────────────────────────────────
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

  // ── Raison ───────────────────────────────────
  raisonText: {
    fontSize: FONTS.size.sm, color: COLORS.grayDark,
    lineHeight: 22, backgroundColor: COLORS.grayPale,
    borderRadius: RADIUS.md, padding: SPACE.md,
  },

  // ── Types ────────────────────────────────────
  typesGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  typePill: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.xs,
    borderRadius: RADIUS.full, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm,
  },
  typePillTxt: { fontSize: FONTS.size.xs, fontWeight: FONTS.weight.bold },

  // ── Rejet ────────────────────────────────────
  rejetBlock: {
    backgroundColor: '#FFEBEE', borderRadius: RADIUS.md, padding: SPACE.md,
  },
  rejetTxt: { fontSize: FONTS.size.sm, color: COLORS.statut.rejetee, lineHeight: 20 },

  // ── Timeline ─────────────────────────────────
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

  // ── PDF ──────────────────────────────────────
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

  // ── Retry ────────────────────────────────────
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    backgroundColor: COLORS.green, borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.xl, paddingVertical: SPACE.md,
    marginTop: SPACE.lg,
  },
  retryBtnTxt: { color: COLORS.white, fontSize: FONTS.size.md, fontWeight: FONTS.weight.bold },
});