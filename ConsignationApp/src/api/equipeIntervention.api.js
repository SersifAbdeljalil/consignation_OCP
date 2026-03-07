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

export const getRapport = async (demande_id) => {
  const res = await client.get(`/equipe-intervention/${demande_id}/rapport`);
  return res.data;
};

// ── POST ─────────────────────────────────────────────────────────

// FIX : enregistrerMembre accepte maintenant FormData (multipart/form-data)
// pour uploader la photo, OU un objet JSON simple (réactivation sans photo).
// Si data est une instance de FormData → multipart, sinon → JSON classique.
export const enregistrerMembre = async (data) => {
  const isFormData = data instanceof FormData;
  const res = await client.post('/equipe-intervention/membre', data, {
    headers: isFormData
      ? { 'Content-Type': 'multipart/form-data' }
      : { 'Content-Type': 'application/json' },
  });
  return res.data;
};

export const verifierBadge = async (data) => {
  const res = await client.post('/equipe-intervention/membre/verifier-badge', data);
  return res.data;
};

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

// Returns réponse axios directe (pas .data) — le frontend gère res.status
export const supprimerMembre = (membreId) =>
  client.delete(`/equipe-intervention/membre/${membreId}`);