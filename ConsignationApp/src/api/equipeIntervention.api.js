// src/api/equipeIntervention.api.js
// ══════════════════════════════════════════════════════════════
// API calls pour la gestion des équipes intervenantes
// Utilisé par : scanBadge.js, monEquipe.js
// ══════════════════════════════════════════════════════════════
import client from './client';

// ── Tous mes membres (toutes demandes confondues) ─────────────
// Retourne : [ { id, nom, matricule, heure_entree, heure_sortie,
//               numero_ordre, tag, equipement_nom, ... } ]
export const getMesMembresEquipe = async () => {
  const res = await client.get('/equipe-intervention/mes-membres');
  return res.data;
};

// ── Charger l'équipe déjà enregistrée pour une demande ────────
// Retourne : { membres: [], equipe_validee: 0|1, tag, numero_ordre }
export const getEquipe = async (demande_id) => {
  const res = await client.get(`/equipe-intervention/${demande_id}`);
  return res.data;
};

// ── Enregistrer un membre (badge + cadenas scannés) ───────────
// data : { demande_id, nom, matricule?, badge_ocp_id, numero_cadenas }
export const enregistrerMembre = async (data) => {
  const res = await client.post('/equipe-intervention/membre', data);
  return res.data;
};

// ── Valider l'équipe complète → notifie l'agent demandeur ─────
export const validerEquipe = async (demande_id) => {
  const res = await client.post(`/equipe-intervention/${demande_id}/valider`);
  return res.data;
};

// ── Marquer l'entrée d'un membre sur site ─────────────────────
export const marquerEntreeMembre = async (id) => {
  const res = await client.put(`/equipe-intervention/membre/${id}/entree`);
  return res.data;
};

// ── Marquer la sortie d'un membre du site ─────────────────────
export const marquerSortieMembre = async (id) => {
  const res = await client.put(`/equipe-intervention/membre/${id}/sortie`);
  return res.data;
};