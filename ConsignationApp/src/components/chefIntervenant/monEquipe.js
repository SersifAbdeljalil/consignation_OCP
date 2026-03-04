// src/components/chefIntervenant/monEquipe.js
//
// Vue globale de tous les intervenants que j'ai ajoutés,
// toutes demandes confondues. Fusionne :
//   - table intervenants        (ajout via autorisation)
//   - table equipe_intervention (ajout via scan badge)
//
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StatusBar, RefreshControl, ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMesIntervenants } from '../../api/intervenant.api';
import { getMesMembresEquipe } from '../../api/equipeIntervention.api';

const TYPE_CFG = {
  genie_civil: { couleur: '#1565C0', bg: '#FFF3E0' },
  mecanique:   { couleur: '#1565C0', bg: '#E3F2FD' },
  electrique:  { couleur: '#1565C0', bg: '#FFFDE7' },
  process:     { couleur: '#1565C0', bg: '#E8F5E9' },
};

const FILTRES = [
  { key: 'tous',     label: 'Tous',        icon: 'people-outline'         },
  { key: 'present',  label: 'Sur site',    icon: 'log-in-outline'         },
  { key: 'sorti',    label: 'Sortis',      icon: 'log-out-outline'        },
  { key: 'attente',  label: 'En attente',  icon: 'time-outline'           },
];

const fmtHeure = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return `${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`;
};

export default function MonEquipe({ navigation }) {
  const [user, setUser]                 = useState(null);
  const [intervenants, setIntervenants] = useState([]);
  const [filtre, setFiltre]             = useState('tous');
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);

  const cfg = TYPE_CFG[user?.type_metier] || TYPE_CFG.mecanique;

  // ── Chargement fusionné des deux tables ──────────────────────
  const charger = async () => {
    try {
      const stored = await AsyncStorage.getItem('user');
      if (stored) setUser(JSON.parse(stored));

      const [res1, res2] = await Promise.all([
        getMesIntervenants(),   // table intervenants (autorisation)
        getMesMembresEquipe(),  // table equipe_intervention (scan badge)
      ]);

      const liste1 = res1.success ? res1.data : [];
      const liste2 = res2.success ? res2.data : [];

      // Normaliser les membres equipe_intervention pour qu'ils
      // partagent le même format que les intervenants
      const liste2Normalisee = liste2.map(m => ({
        ...m,
        // equipe_intervention stocke "nom" en un seul champ
        // → on sépare pour l'affichage (ou on garde tel quel)
        prenom: m.prenom || m.nom?.split(' ')[0] || '',
        nom:    m.nom_famille || m.nom?.split(' ').slice(1).join(' ') || m.nom || '',
        source: 'equipe', // marqueur pour debug
      }));

      setIntervenants([...liste1, ...liste2Normalisee]);
    } catch (e) {
      console.error('charger error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { charger(); }, []);
  const onRefresh = useCallback(() => { setRefreshing(true); charger(); }, []);

  // ── Filtrage ─────────────────────────────────────────────────
  const filtered = intervenants.filter(i => {
    if (filtre === 'tous')    return true;
    if (filtre === 'present') return !!i.heure_entree && !i.heure_sortie;
    if (filtre === 'sorti')   return !!i.heure_sortie;
    if (filtre === 'attente') return !i.heure_entree;
    return true;
  });

  // ── Stats ─────────────────────────────────────────────────────
  const stats = {
    total:   intervenants.length,
    present: intervenants.filter(i => !!i.heure_entree && !i.heure_sortie).length,
    sortis:  intervenants.filter(i => !!i.heure_sortie).length,
    attente: intervenants.filter(i => !i.heure_entree).length,
  };

  // ── Card intervenant ─────────────────────────────────────────
  const renderCard = ({ item }) => {
    const entree = !!item.heure_entree;
    const sortie = !!item.heure_sortie;

    // Initiales : gérer nom en un ou deux champs
    const prenomInit = (item.prenom || item.nom || '?')[0];
    const nomInit    = item.prenom
      ? (item.nom || '?')[0]
      : (item.nom?.split(' ')[1] || '?')[0];
    const initiales  = `${prenomInit}${nomInit}`.toUpperCase();

    // Statut présence
    let presenceColor = '#F59E0B';
    let presenceBg    = '#FFFBEB';
    let presenceLabel = 'En attente';
    let presenceIcon  = 'time-outline';
    if (entree && !sortie) {
      presenceColor = '#10B981'; presenceBg = '#ECFDF5';
      presenceLabel = 'Sur site'; presenceIcon = 'checkmark-circle-outline';
    } else if (sortie) {
      presenceColor = '#6B7280'; presenceBg = '#F9FAFB';
      presenceLabel = 'Sorti'; presenceIcon = 'log-out-outline';
    }

    return (
      <View style={S.card}>
        {/* Avatar + point statut */}
        <View style={{ alignItems: 'center', marginRight: 12 }}>
          <View style={[S.avatar, { backgroundColor: cfg.bg }]}>
            <Text style={[S.avatarTxt, { color: cfg.couleur }]}>{initiales}</Text>
          </View>
          <View style={[S.presenceDot, { backgroundColor: presenceColor }]} />
        </View>

        {/* Infos */}
        <View style={{ flex: 1 }}>
          <Text style={S.intNom}>
            {item.prenom ? `${item.prenom} ${item.nom}` : item.nom}
          </Text>
          <Text style={S.intMeta}>
            {item.matricule || 'Sans matricule'}
          </Text>

          {/* Demande associée */}
          <View style={S.demandeRow}>
            <Ionicons name="document-text-outline" size={10} color="#9E9E9E" />
            <Text style={S.demandeTxt}>
              {item.numero_ordre}  ·  {item.tag}
            </Text>
          </View>

          {/* Horaires */}
          <View style={S.horairesRow}>
            {entree && (
              <View style={S.hBadge}>
                <Ionicons name="log-in-outline" size={10} color="#10B981" />
                <Text style={[S.hBadgeTxt, { color: '#10B981' }]}>
                  Entrée {fmtHeure(item.heure_entree)}
                </Text>
              </View>
            )}
            {sortie && (
              <View style={[S.hBadge, { backgroundColor: '#F5F5F5' }]}>
                <Ionicons name="log-out-outline" size={10} color="#6B7280" />
                <Text style={[S.hBadgeTxt, { color: '#6B7280' }]}>
                  Sortie {fmtHeure(item.heure_sortie)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Badge statut */}
        <View style={[S.statutBadge, { backgroundColor: presenceBg }]}>
          <Ionicons name={presenceIcon} size={12} color={presenceColor} />
          <Text style={[S.statutTxt, { color: presenceColor }]}>{presenceLabel}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={cfg.couleur} />

      {/* ── Header ── */}
      <View style={[S.header, { backgroundColor: cfg.couleur }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Mon Équipe</Text>
          <Text style={S.hSub}>Tous les intervenants ajoutés</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Stats bar ── */}
      <View style={[S.statsBar, { backgroundColor: cfg.couleur }]}>
        {[
          { val: stats.total,   icon: 'people-outline',          lbl: 'Total'      },
          { val: stats.present, icon: 'checkmark-circle-outline', lbl: 'Sur site'  },
          { val: stats.sortis,  icon: 'log-out-outline',          lbl: 'Sortis'    },
          { val: stats.attente, icon: 'time-outline',             lbl: 'En attente'},
        ].map((s, i) => (
          <View key={i} style={S.statItem}>
            <Ionicons name={s.icon} size={13} color="rgba(255,255,255,0.75)" />
            <Text style={S.statVal}>{s.val}</Text>
            <Text style={S.statLbl}>{s.lbl}</Text>
          </View>
        ))}
      </View>

      {/* ── Filtres ── */}
      <View style={S.filtresRow}>
        {FILTRES.map(f => {
          const sel = filtre === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[S.filtreBtn, sel && { backgroundColor: cfg.couleur }]}
              onPress={() => setFiltre(f.key)}
            >
              <Ionicons
                name={f.icon}
                size={13}
                color={sel ? '#fff' : '#9E9E9E'}
              />
              <Text style={[S.filtreTxt, sel && { color: '#fff' }]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Liste ── */}
      {loading
        ? <ActivityIndicator color={cfg.couleur} size="large" style={{ marginTop: 50 }} />
        : (
          <FlatList
            data={filtered}
            keyExtractor={(item, index) => `${item.source || 'int'}-${item.id}-${index}`}
            renderItem={renderCard}
            contentContainerStyle={{ padding: 14, paddingBottom: 50 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[cfg.couleur]}
                tintColor={cfg.couleur}
              />
            }
            ListEmptyComponent={
              <View style={S.empty}>
                <View style={[S.emptyCircle, { backgroundColor: cfg.bg }]}>
                  <Ionicons name="people-outline" size={38} color={cfg.couleur} />
                </View>
                <Text style={S.emptyTitle}>Aucun intervenant</Text>
                <Text style={S.emptySub}>
                  {filtre === 'tous'
                    ? "Ajoutez des membres depuis le détail d'une consignation"
                    : 'Aucun intervenant dans cette catégorie'}
                </Text>
              </View>
            }
          />
        )
      }
    </View>
  );
}

const S = StyleSheet.create({
  // Header
  header:   { paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn:  { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:   { color: '#fff', fontSize: 18, fontWeight: '700' },
  hSub:     { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },

  // Stats
  statsBar: { flexDirection: 'row', paddingHorizontal: 10, paddingBottom: 18, paddingTop: 4 },
  statItem: { flex: 1, alignItems: 'center', gap: 3 },
  statVal:  { color: '#fff', fontSize: 22, fontWeight: '800' },
  statLbl:  { color: 'rgba(255,255,255,0.7)', fontSize: 9, textAlign: 'center' },

  // Filtres
  filtresRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 12, gap: 8, flexWrap: 'wrap' },
  filtreBtn:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#EEEEEE', gap: 5 },
  filtreTxt:  { fontSize: 12, fontWeight: '600', color: '#9E9E9E' },

  // Card
  card:        { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  avatar:      { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:   { fontSize: 15, fontWeight: '800' },
  presenceDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, borderWidth: 2, borderColor: '#fff' },
  intNom:      { fontSize: 15, fontWeight: '700', color: '#212121' },
  intMeta:     { fontSize: 11, color: '#9E9E9E', marginTop: 2 },
  demandeRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  demandeTxt:  { fontSize: 11, color: '#9E9E9E' },
  horairesRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  hBadge:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, gap: 3 },
  hBadgeTxt:   { fontSize: 10, fontWeight: '700' },
  statutBadge: { alignItems: 'center', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, gap: 3, marginLeft: 6 },
  statutTxt:   { fontSize: 9, fontWeight: '800' },

  // Empty
  empty:       { alignItems: 'center', paddingTop: 60, paddingHorizontal: 36 },
  emptyCircle: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle:  { fontSize: 16, fontWeight: '700', color: '#424242' },
  emptySub:    { fontSize: 13, color: '#9E9E9E', marginTop: 8, textAlign: 'center', lineHeight: 20 },
});