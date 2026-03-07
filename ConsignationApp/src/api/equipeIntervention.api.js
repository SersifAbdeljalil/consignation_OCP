// src/api/equipeIntervention.api.js
import client from './client';

// ── GET ──────────────────────────────────────────────────────────
export const getMesMembresEquipe = async () => {
  const res = await client.get('/equipe-intervention/mes-membres');
  return res.data;
};
export const getEquipe = async (demande_id) => {
  const res = await client.get(`/equipe-intervention/${demande_id}`);
  return res.data;
};
export const getIntervenantsDispos = async (demande_id) => {
  const res = await client.get(`/equipe-intervention/${demande_id}/intervenants-dispos`);
  return res.data;
};
export const getStatutDeconsignation = async (demande_id) => {
  const res = await client.get(`/equipe-intervention/${demande_id}/statut-deconsignation`);
  return res.data;
};
// Récupérer le rapport final (pdf_path + stats + chronologie)
export const getRapport = async (demande_id) => {
  const res = await client.get(`/equipe-intervention/${demande_id}/rapport`);
  return res.data;
};

// ── POST ─────────────────────────────────────────────────────────
// Body: { demande_id, nom, matricule?, badge_ocp_id?, numero_cadenas?, cad_id?, photo_path? }
export const enregistrerMembre = async (data) => {
  const res = await client.post('/equipe-intervention/membre', data);
  return res.data;
};
export const verifierBadge = async (data) => {
  const res = await client.post('/equipe-intervention/membre/verifier-badge', data);
  return res.data;
};
// Vérifier si un cad_id scanné correspond à un membre existant (sorti)
// Body: { cad_id?: string } ou { badge_ocp_id?: string }
// Returns: { found: boolean, membre: object|null }
export const verifierCadenas = async (data) => {
  const res = await client.post('/equipe-intervention/membre/verifier-cadenas', data);
  return res.data;
};
export const validerEquipe = async (demande_id) => {
  const res = await client.post(`/equipe-intervention/${demande_id}/valider`);
  return res.data;
};
// Body: { tous: true } ou { membres_ids: [1,2,3], scan_cadenas_entree?: string }
export const marquerEntreeMembres = async (demande_id, data) => {
  const res = await client.post(`/equipe-intervention/${demande_id}/entree-site`, data);
  return res.data;
};
// Valider la déconsignation finale → génère le PDF rapport complet
// Returns: { demande_id, pdf_path, stats, nb_membres, heure_debut, heure_fin, duree_totale }
export const validerDeconsignation = async (demande_id) => {
  const res = await client.post(`/equipe-intervention/${demande_id}/valider-deconsignation`);
  return res.data;
};

// ── PUT ──────────────────────────────────────────────────────────
// Body: { numero_cadenas?, cad_id? }
export const mettreAJourCadenas = async (id, data) => {
  const res = await client.put(`/equipe-intervention/membre/${id}/cadenas`, data);
  return res.data;
};
// Body: { numero_cadenas?, cad_id?, badge_ocp_id? }
// Returns: { membre, tous_sortis, total, sortis }
export const deconsignerMembre = async (id, data) => {
  const res = await client.put(`/equipe-intervention/membre/${id}/deconsigner`, data);
  return res.data;
};
export const marquerEntreeMembre = async (id) => {
  const res = await client.put(`/equipe-intervention/membre/${id}/entree`);
  return res.data;
};
export const marquerSortieMembre = async (id) => {
  const res = await client.put(`/equipe-intervention/membre/${id}/sortie`);
  return res.data;
};