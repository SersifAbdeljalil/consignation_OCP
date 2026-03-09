// src/components/chefIntervenant/monEquipe.js
// ✅ Liste directe de tous les membres (getMesMembresEquipe)
// ✅ Clic → bottom sheet profil complet
// ✅ Fix : modal forcée visible avec useEffect + state stable
// ✅ Fix : fallbacks pour tag / equipement_nom / numero_ordre

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Platform, RefreshControl,
  Modal, ScrollView, Animated, TouchableWithoutFeedback,
  Dimensions, StatusBar, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMesMembresEquipe } from '../../api/equipeIntervention.api';
import { BASE_URL } from '../../api/client';

const { height: SCREEN_H } = Dimensions.get('window');

const CFG = {
  couleur:     '#1565C0',
  couleurDark: '#0D47A1',
  bg:          '#E3F2FD',
};

const STATUT_CFG = {
  en_attente: { label: 'En attente', color: '#F59E0B', bg: '#FFF8E1', icon: 'time-outline'             },
  sur_site:   { label: 'Sur site',   color: '#1565C0', bg: '#E3F2FD', icon: 'construct'                },
  sortie:     { label: 'Sorti',      color: '#388E3C', bg: '#E8F5E9', icon: 'checkmark-circle-outline' },
  sorti:      { label: 'Sorti',      color: '#388E3C', bg: '#E8F5E9', icon: 'checkmark-circle-outline' },
};
const getStatutCfg = (s) =>
  STATUT_CFG[s] || { label: s || '—', color: '#9E9E9E', bg: '#F5F5F5', icon: 'ellipse-outline' };

const pad  = (n) => String(n).padStart(2, '0');
const fmtH = (d) => { if (!d) return null; const dt = new Date(d); return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`; };
const fmtFull = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  return `${pad(dt.getDate())}/${pad(dt.getMonth()+1)}/${dt.getFullYear()} — ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
};
const calcDuree = (e, s) => {
  if (!e || !s) return null;
  const diff = Math.round((new Date(s) - new Date(e)) / 60000);
  if (diff <= 0) return null;
  return diff < 60 ? `${diff} min` : `${Math.floor(diff/60)}h${pad(diff%60)}`;
};

// ── helpers champs API (plusieurs noms possibles) ──────────────────
const getNomEquipement = (m) =>
  m.equipement_nom || m.nom_equipement || m.equipement || null;
const getTag = (m) =>
  m.tag || m.code_equipement || m.equipement_code || null;
const getOrdre = (m) =>
  m.numero_ordre || m.ordre || null;

// ══════════════════════════════════════════════════════════════
// ProfilModal
// ══════════════════════════════════════════════════════════════
function ProfilModal({ membre, visible, onClose }) {
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  // ✅ Animation à chaque changement de visible
  useEffect(() => {
    if (visible) {
      slideAnim.setValue(SCREEN_H);
      fadeAnim.setValue(0);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 240, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 55, friction: 11, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: SCREEN_H, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  // ✅ Ne rien rendre si pas de membre — mais garder le Modal monté
  const sc            = membre ? getStatutCfg(membre.statut) : {};
  const initiale      = membre ? (membre.nom || '?')[0].toUpperCase() : '?';
  const hasCadenas    = membre ? !!(membre.cad_id || membre.numero_cadenas) : false;
  const hasBadge      = membre ? !!membre.badge_ocp_id : false;
  const hasPhoto      = membre ? !!membre.photo_path : false;
  const nbComplet     = [hasCadenas, hasBadge, hasPhoto].filter(Boolean).length;
  const completudePct = Math.round((nbComplet / 3) * 100);
  const dureeTotal    = membre ? calcDuree(membre.heure_entree, membre.heure_sortie) : null;

  const nomEquipement = membre ? getNomEquipement(membre) : null;
  const tag           = membre ? getTag(membre) : null;
  const ordre         = membre ? getOrdre(membre) : null;

  // Photo
  const photoUri = (hasPhoto && membre?.photo_path)
    ? `${BASE_URL}/${membre.photo_path}`.replace(/([^:]\/)\/+/g, '$1')
    : null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[PM.backdrop, { opacity: fadeAnim }]} />
      </TouchableWithoutFeedback>

      {/* Sheet */}
      <Animated.View style={[PM.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={PM.handle} />

        {membre ? (
          <>
            {/* ── En-tête ── */}
            <View style={PM.headerRow}>
              {/* Avatar / Photo */}
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={PM.avatarImg} />
              ) : (
                <View style={[PM.avatarCircle, { backgroundColor: sc.bg }]}>
                  <Text style={[PM.avatarTxt, { color: sc.color }]}>{initiale}</Text>
                </View>
              )}

              {/* Nom + matricule + statut */}
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={PM.nomTxt}>{membre.nom || '—'}</Text>
                {membre.matricule ? (
                  <Text style={PM.matriculeTxt}>Mat. {membre.matricule}</Text>
                ) : null}
                <View style={[PM.statutPill, { backgroundColor: sc.bg }]}>
                  <Ionicons name={sc.icon} size={11} color={sc.color} />
                  <Text style={[PM.statutPillTxt, { color: sc.color }]}> {sc.label}</Text>
                </View>
              </View>

              {/* Fermer */}
              <TouchableOpacity style={PM.closeBtn} onPress={onClose}>
                <Ionicons name="close" size={20} color="#9E9E9E" />
              </TouchableOpacity>
            </View>

            {/* ── Jauge complétude ── */}
            <View style={PM.completudeBox}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={PM.completudeLbl}>Profil complété</Text>
                <Text style={[PM.completudePctTxt, { color: nbComplet === 3 ? '#388E3C' : '#F59E0B' }]}>
                  {completudePct}%
                </Text>
              </View>
              <View style={PM.progressBg}>
                <View style={[PM.progressFill, {
                  width: `${completudePct}%`,
                  backgroundColor: nbComplet === 3 ? '#388E3C' : '#F59E0B',
                }]} />
              </View>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                {[
                  { ok: hasCadenas, icon: 'lock-closed', label: 'Cadenas', okC: '#388E3C', okBg: '#E8F5E9', noC: '#F59E0B', noBg: '#FFF8E1' },
                  { ok: hasBadge,   icon: 'card',        label: 'Badge',   okC: '#1565C0', okBg: '#E3F2FD', noC: '#F59E0B', noBg: '#FFF8E1' },
                  { ok: hasPhoto,   icon: 'camera',      label: 'Photo',   okC: '#1565C0', okBg: '#E3F2FD', noC: '#EF4444', noBg: '#FEE2E2' },
                ].map((c, i) => (
                  <View key={i} style={[PM.completudeChip, { backgroundColor: c.ok ? c.okBg : c.noBg }]}>
                    <Ionicons name={c.ok ? c.icon : `${c.icon}-outline`} size={11} color={c.ok ? c.okC : c.noC} />
                    <Text style={[PM.completudeChipTxt, { color: c.ok ? c.okC : c.noC }]}>
                      {c.label} {c.ok ? '✓' : '✗'}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* ── Contenu scroll ── */}
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Identité */}
              <Text style={PM.sectionLbl}>IDENTITÉ</Text>
              <View style={PM.infoCard}>
                {[
                  { icon: 'person-outline',      label: 'Nom complet',   val: membre.nom,                            bg: '#E3F2FD', c: '#1565C0' },
                  { icon: 'id-card-outline',     label: 'Matricule',     val: membre.matricule,                      bg: '#F3E5F5', c: '#6A1B9A' },
                  { icon: 'card-outline',        label: 'Badge OCP',     val: membre.badge_ocp_id,                   bg: '#E3F2FD', c: '#1565C0' },
                  { icon: 'lock-closed-outline', label: 'N° Cadenas',    val: membre.numero_cadenas || membre.cad_id, bg: '#E8F5E9', c: '#388E3C' },
                ].filter(r => r.val).map((row, i, arr) => (
                  <View key={i} style={[PM.infoRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#F5F5F5' }]}>
                    <View style={[PM.infoIcon, { backgroundColor: row.bg }]}>
                      <Ionicons name={row.icon} size={15} color={row.c} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={PM.infoLbl}>{row.label}</Text>
                      <Text style={PM.infoVal}>{row.val}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Intervention */}
              <Text style={PM.sectionLbl}>INTERVENTION</Text>
              <View style={PM.infoCard}>
                {membre.heure_entree ? (
                  <View style={PM.infoRow}>
                    <View style={[PM.infoIcon, { backgroundColor: '#E8F5E9' }]}>
                      <Ionicons name="log-in-outline" size={15} color="#388E3C" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={PM.infoLbl}>Heure d'entrée</Text>
                      <Text style={PM.infoVal}>{fmtFull(membre.heure_entree)}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={PM.infoRow}>
                    <View style={[PM.infoIcon, { backgroundColor: '#FFF8E1' }]}>
                      <Ionicons name="time-outline" size={15} color="#F59E0B" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={PM.infoLbl}>Statut</Text>
                      <Text style={[PM.infoVal, { color: '#F59E0B' }]}>En attente d'entrée</Text>
                    </View>
                  </View>
                )}
                {membre.heure_sortie && (
                  <View style={[PM.infoRow, { borderTopWidth: 1, borderTopColor: '#F5F5F5' }]}>
                    <View style={[PM.infoIcon, { backgroundColor: '#FEE2E2' }]}>
                      <Ionicons name="log-out-outline" size={15} color="#EF4444" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={PM.infoLbl}>Heure de sortie</Text>
                      <Text style={PM.infoVal}>{fmtFull(membre.heure_sortie)}</Text>
                    </View>
                  </View>
                )}
                {dureeTotal && (
                  <View style={[PM.infoRow, { borderTopWidth: 1, borderTopColor: '#F5F5F5' }]}>
                    <View style={[PM.infoIcon, { backgroundColor: '#F3E5F5' }]}>
                      <Ionicons name="timer-outline" size={15} color="#6A1B9A" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={PM.infoLbl}>Durée totale</Text>
                      <Text style={[PM.infoVal, { color: '#6A1B9A', fontWeight: '800' }]}>{dureeTotal}</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Consignation liée */}
              {(ordre || tag || nomEquipement) && (
                <>
                  <Text style={PM.sectionLbl}>CONSIGNATION LIÉE</Text>
                  <View style={PM.infoCard}>
                    {[
                      { icon: 'document-text-outline',   label: 'N° d\'ordre',  val: ordre,         bg: '#E3F2FD', c: '#1565C0' },
                      { icon: 'hardware-chip-outline',   label: 'TAG',          val: tag,            bg: '#E3F2FD', c: '#1565C0' },
                      { icon: 'cube-outline',            label: 'Équipement',   val: nomEquipement,  bg: '#E3F2FD', c: '#1565C0' },
                    ].filter(r => r.val).map((row, i) => (
                      <View key={i} style={[PM.infoRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#F5F5F5' }]}>
                        <View style={[PM.infoIcon, { backgroundColor: row.bg }]}>
                          <Ionicons name={row.icon} size={15} color={row.c} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={PM.infoLbl}>{row.label}</Text>
                          <Text style={PM.infoVal}>{row.val}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {/* Toutes les données brutes si debug */}
              {/* __DEV__ && console.log('[MonEquipe] membre data:', JSON.stringify(membre, null, 2)) */}
            </ScrollView>
          </>
        ) : null}

        {/* Footer fermer */}
        <View style={PM.footer}>
          <TouchableOpacity style={PM.btnFermer} onPress={onClose} activeOpacity={0.85}>
            <Text style={PM.btnFermerTxt}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════
// MembreCard
// ══════════════════════════════════════════════════════════════
function MembreCard({ membre, onPress }) {
  const sc         = getStatutCfg(membre.statut);
  const initiale   = (membre.nom || '?')[0].toUpperCase();
  const hasCadenas = !!(membre.cad_id || membre.numero_cadenas);
  const hasBadge   = !!membre.badge_ocp_id;
  const hasPhoto   = !!membre.photo_path;
  const nbComplet  = [hasCadenas, hasBadge, hasPhoto].filter(Boolean).length;

  return (
    <TouchableOpacity
      style={MC.card}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <View style={[MC.stripe, { backgroundColor: sc.color }]} />

      <View style={[MC.avatar, { backgroundColor: sc.bg }]}>
        <Text style={[MC.avatarTxt, { color: sc.color }]}>{initiale}</Text>
      </View>

      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={MC.nomTxt}>{membre.nom || '—'}</Text>

        <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginBottom: 4 }}>
          {membre.badge_ocp_id ? (
            <View style={[MC.metaChip, { backgroundColor: '#E3F2FD' }]}>
              <Ionicons name="card-outline" size={10} color="#1565C0" />
              <Text style={[MC.metaChipTxt, { color: '#1565C0' }]}>{membre.badge_ocp_id}</Text>
            </View>
          ) : null}
          {membre.matricule ? (
            <View style={[MC.metaChip, { backgroundColor: '#F3E5F5' }]}>
              <Ionicons name="id-card-outline" size={10} color="#6A1B9A" />
              <Text style={[MC.metaChipTxt, { color: '#6A1B9A' }]}>{membre.matricule}</Text>
            </View>
          ) : null}
        </View>

        {(membre.heure_entree || membre.heure_sortie) ? (
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            {membre.heure_entree ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="log-in-outline" size={10} color="#388E3C" />
                <Text style={{ fontSize: 10, fontWeight: '600', color: '#388E3C' }}>
                  Entrée {fmtH(membre.heure_entree)}
                </Text>
              </View>
            ) : null}
            {membre.heure_sortie ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="log-out-outline" size={10} color="#EF4444" />
                <Text style={{ fontSize: 10, fontWeight: '600', color: '#EF4444' }}>
                  Sortie {fmtH(membre.heure_sortie)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Indicateurs complétude */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
          {[
            { ok: hasCadenas, icon: 'lock-closed', noIcon: 'lock-open-outline', c: '#388E3C' },
            { ok: hasBadge,   icon: 'card',        noIcon: 'card-outline',       c: '#1565C0' },
            { ok: hasPhoto,   icon: 'camera',      noIcon: 'camera-outline',     c: '#1565C0' },
          ].map((c, i) => (
            <Ionicons key={i} name={c.ok ? c.icon : c.noIcon} size={12}
              color={c.ok ? c.c : '#D1D5DB'} style={{ marginRight: 4 }}
            />
          ))}
          <Text style={{ fontSize: 10, fontWeight: '700', marginLeft: 2, color: nbComplet === 3 ? '#388E3C' : '#F59E0B' }}>
            {nbComplet}/3
          </Text>
        </View>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 8 }}>
        <View style={[MC.statutBadge, { backgroundColor: sc.bg }]}>
          <Ionicons name={sc.icon} size={10} color={sc.color} />
          <Text style={[MC.statutTxt, { color: sc.color }]}> {sc.label}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={CFG.couleur} />
      </View>
    </TouchableOpacity>
  );
}

// ══════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function MonEquipe({ navigation }) {
  const [membres,    setMembres]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selMembre,  setSelMembre]  = useState(null);
  const [modalOpen,  setModalOpen]  = useState(false);

  const charger = useCallback(async () => {
    try {
      const res = await getMesMembresEquipe();
      if (res?.success) setMembres(res.data || []);
    } catch (e) {
      console.error('[MonEquipe] erreur chargement:', e?.message || e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', charger);
    return unsub;
  }, [navigation, charger]);

  const onRefresh = () => { setRefreshing(true); charger(); };

  // ✅ Ouvrir le modal : on set le membre PUIS on ouvre
  const ouvrirProfil = (membre) => {
    setSelMembre(membre);
    setModalOpen(true);
  };

  const fermerModal = () => {
    setModalOpen(false);
    // On garde selMembre encore 300ms pour l'animation de fermeture
    setTimeout(() => setSelMembre(null), 350);
  };

  const stats = {
    total:     membres.length,
    surSite:   membres.filter(m => m.statut === 'sur_site').length,
    enAttente: membres.filter(m => m.statut === 'en_attente').length,
    sortis:    membres.filter(m => ['sortie', 'sorti'].includes(m.statut)).length,
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
          <Text style={S.hTitle}>Mon Équipe</Text>
          <Text style={S.hSub}>{stats.total} membre{stats.total !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity style={S.backBtn} onPress={onRefresh}>
          <Ionicons name="refresh-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={[S.statsDash, { backgroundColor: CFG.couleur }]}>
        <View style={S.statsRow}>
          {[
            { val: stats.surSite,   lbl: 'Sur site',   color: '#6EE7B7', icon: 'construct'        },
            { val: stats.enAttente, lbl: 'En attente', color: '#FDE68A', icon: 'time-outline'     },
            { val: stats.sortis,    lbl: 'Sortis',     color: '#D1D5DB', icon: 'checkmark-circle' },
            { val: stats.total,     lbl: 'Total',      color: '#fff',    icon: 'people-outline'   },
          ].map((s, i) => (
            <View key={i} style={S.statItem}>
              <Ionicons name={s.icon} size={13} color={s.color} style={{ marginBottom: 2 }} />
              <Text style={[S.statVal, { color: s.color }]}>{s.val}</Text>
              <Text style={S.statLbl}>{s.lbl}</Text>
            </View>
          ))}
        </View>
        {stats.total > 0 && (
          <View style={{ marginTop: 10 }}>
            <View style={S.progressBar}>
              {stats.sortis > 0 && <View style={[S.progressSeg, { flex: stats.sortis, backgroundColor: '#388E3C' }]} />}
              {stats.surSite > 0 && <View style={[S.progressSeg, { flex: stats.surSite, backgroundColor: '#90CAF9' }]} />}
              {stats.enAttente > 0 && <View style={[S.progressSeg, { flex: stats.enAttente, backgroundColor: 'rgba(255,255,255,0.2)' }]} />}
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10, marginTop: 5, textAlign: 'center' }}>
              {stats.surSite} sur site · {stats.sortis} sortis · {stats.enAttente} en attente
            </Text>
          </View>
        )}
      </View>

      {/* Tip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8 }}>
        <Ionicons name="information-circle-outline" size={13} color="#BDBDBD" />
        <Text style={{ fontSize: 10, color: '#BDBDBD', fontStyle: 'italic' }}>
          Appuyez sur un membre pour voir son profil complet
        </Text>
      </View>

      {/* Liste */}
      {membres.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={S.emptyBox}>
            <Ionicons name="people-outline" size={40} color={CFG.couleur} />
          </View>
          <Text style={S.emptyTitle}>Aucun membre</Text>
          <Text style={S.emptySub}>
            Vos membres d'équipe apparaîtront ici une fois que vous aurez des consignations actives.
          </Text>
        </View>
      ) : (
        <FlatList
          data={membres}
          keyExtractor={item => String(item.id)}
          renderItem={({ item }) => (
            <MembreCard membre={item} onPress={() => ouvrirProfil(item)} />
          )}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[CFG.couleur]}
              tintColor={CFG.couleur}
            />
          }
        />
      )}

      {/* Modal profil */}
      <ProfilModal
        membre={selMembre}
        visible={modalOpen}
        onClose={fermerModal}
      />
    </View>
  );
}

// ── Styles ProfilModal ────────────────────────────────────────
const PM = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: SCREEN_H * 0.88,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: -4 } },
      android: { elevation: 20 },
    }),
  },
  handle:    { width: 40, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 10 },
  avatarImg:    { width: 60, height: 60, borderRadius: 30 },
  avatarCircle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:    { fontSize: 24, fontWeight: '900' },
  nomTxt:       { fontSize: 17, fontWeight: '800', color: '#212121' },
  matriculeTxt: { fontSize: 12, color: '#9E9E9E', marginTop: 1 },
  statutPill:   { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 5 },
  statutPillTxt:{ fontSize: 11, fontWeight: '700' },
  closeBtn:     { width: 30, height: 30, backgroundColor: '#F5F5F5', borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },

  completudeBox:    { backgroundColor: '#F8FAFB', marginHorizontal: 16, borderRadius: 14, padding: 12, marginBottom: 6 },
  completudeLbl:    { fontSize: 11, color: '#9E9E9E', fontWeight: '600' },
  completudePctTxt: { fontSize: 13, fontWeight: '800' },
  progressBg:       { height: 6, backgroundColor: '#E0E0E0', borderRadius: 3 },
  progressFill:     { height: '100%', borderRadius: 3 },
  completudeChip:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  completudeChipTxt:{ fontSize: 10, fontWeight: '700' },

  sectionLbl: { fontSize: 10, fontWeight: '800', color: '#BDBDBD', letterSpacing: 1, marginTop: 14, marginBottom: 6 },
  infoCard:   { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#F0F0F0', overflow: 'hidden' },
  infoRow:    { flexDirection: 'row', alignItems: 'center', padding: 12 },
  infoIcon:   { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoLbl:    { fontSize: 10, color: '#9E9E9E', marginBottom: 2 },
  infoVal:    { fontSize: 13, fontWeight: '700', color: '#212121' },

  footer:      { padding: 16, paddingBottom: Platform.OS === 'ios' ? 32 : 16, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  btnFermer:   { backgroundColor: '#F5F5F5', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnFermerTxt:{ fontSize: 15, fontWeight: '700', color: '#424242' },
});

// ── Styles MembreCard ─────────────────────────────────────────
const MC = StyleSheet.create({
  card:       { backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'flex-start', overflow: 'hidden', elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  stripe:     { width: 4, alignSelf: 'stretch', borderRadius: 2, marginRight: 0 },
  avatar:     { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  avatarTxt:  { fontSize: 18, fontWeight: '900' },
  nomTxt:     { fontSize: 14, fontWeight: '700', color: '#212121', marginBottom: 3 },
  metaChip:   { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  metaChipTxt:{ fontSize: 10, fontWeight: '600' },
  statutBadge:{ flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  statutTxt:  { fontSize: 9, fontWeight: '800' },
});

// ── Styles généraux ───────────────────────────────────────────
const S = StyleSheet.create({
  header:    { paddingTop: Platform.OS === 'ios' ? 52 : 36, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn:   { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  hTitle:    { color: '#fff', fontWeight: '700', fontSize: 17 },
  hSub:      { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },
  statsDash: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 4 },
  statsRow:  { flexDirection: 'row', justifyContent: 'space-between' },
  statItem:  { alignItems: 'center', flex: 1 },
  statVal:   { fontSize: 22, fontWeight: '900' },
  statLbl:   { color: 'rgba(255,255,255,0.7)', fontSize: 9, marginTop: 1, textAlign: 'center' },
  progressBar:{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.15)' },
  progressSeg:{ height: '100%' },
  emptyBox:  { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle:{ fontSize: 16, fontWeight: '700', color: '#424242', marginBottom: 8 },
  emptySub:  { fontSize: 13, color: '#9E9E9E', textAlign: 'center', lineHeight: 20 },
});