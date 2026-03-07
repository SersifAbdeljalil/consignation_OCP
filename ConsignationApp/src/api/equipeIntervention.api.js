// src/api/equipeIntervention.api.js
import client from './client';

// ── GET ──────────────────────────────────────────────────────

// Tous les membres de mes équipes (toutes demandes confondues)
export const getMesMembresEquipe = async () => {
  const res = await client.get('/equipe-intervention/mes-membres');
  return res.data;
};

// Membres d'une demande spécifique
export const getEquipe = async (demande_id) => {
  const res = await client.get(`/equipe-intervention/${demande_id}`);
  return res.data;
};

// Intervenants disponibles pour une demande (membres sortis réactivables)
export const getIntervenantsDispos = async (demande_id) => {
  const res = await client.get(`/equipe-intervention/${demande_id}/intervenants-dispos`);
  return res.data;
};

// Statut déconsignation d'une demande (sur_site, sortis, total, peut_deconsigner...)
export const getStatutDeconsignation = async (demande_id) => {
  const res = await client.get(`/equipe-intervention/${demande_id}/statut-deconsignation`);
  return res.data;
};

// ── POST ─────────────────────────────────────────────────────

// Enregistrer un membre (INSERT ou UPDATE si déjà sorti — CORRECTION P1)
// Body: { demande_id, nom, matricule?, badge_ocp_id?, numero_cadenas? }
export const enregistrerMembre = async (data) => {
  const res = await client.post('/equipe-intervention/membre', data);
  return res.data;
};

// Vérifier un badge OCP ou matricule dans la table users
// Body: { badge_ocp_id? } ou { matricule? }
export const verifierBadge = async (data) => {
  const res = await client.post('/equipe-intervention/membre/verifier-badge', data);
  return res.data;
};

// Valider l'équipe (marque equipe_validee=1 SANS forcer sur_site — CORRECTION P2)
export const validerEquipe = async (demande_id) => {
  const res = await client.post(`/equipe-intervention/${demande_id}/valider`);
  return res.data;
};

// Marquer l'entrée sur site : tous ou sélection (NOUVEAU P2)
// Body: { tous: true } ou { membres_ids: [1,2,3] }
export const marquerEntreeMembres = async (demande_id, data) => {
  const res = await client.post(`/equipe-intervention/${demande_id}/entree-site`, data);
  return res.data;
};

// ── PUT ──────────────────────────────────────────────────────

// Mettre à jour le cadenas d'un membre
// Body: { numero_cadenas }
export const mettreAJourCadenas = async (id, numero_cadenas) => {
  const res = await client.put(`/equipe-intervention/membre/${id}/cadenas`, {
    numero_cadenas,
  });
  return res.data;
};

// Enregistrer la sortie d'un membre via scan cadenas + badge (CORRECTION P3)
// Body: { numero_cadenas }
export const deconsignerMembre = async (id, data) => {
  const res = await client.put(`/equipe-intervention/membre/${id}/deconsigner`, data);
  return res.data;
};

// Marquer l'entrée manuelle d'un membre
export const marquerEntreeMembre = async (id) => {
  const res = await client.put(`/equipe-intervention/membre/${id}/entree`);
  return res.data;
};

// Marquer la sortie manuelle d'un membre
export const marquerSortieMembre = async (id) => {
  const res = await client.put(`/equipe-intervention/membre/${id}/sortie`);
  return res.data;
};