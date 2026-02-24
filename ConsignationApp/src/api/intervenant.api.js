// src/api/intervenant.api.js
import client from './client';

// ── Demandes concernant mon corps de métier ──
export const getMesDemandes = async () => {
  const res = await client.get('/intervenants/mes-demandes');
  return res.data;
};

// ── Mon équipe d'intervenants ─────────────────
export const getMesIntervenants = async () => {
  const res = await client.get('/intervenants/mes-intervenants');
  return res.data;
};

// ── Autorisation + liste intervenants d'une demande ──
export const getAutorisation = async (demandeId) => {
  const res = await client.get(`/intervenants/autorisation/${demandeId}`);
  return res.data;
};

// ── Ajouter un intervenant ────────────────────
export const ajouterIntervenant = async (data) => {
  // data: { autorisation_id, nom, prenom, matricule, badge_ocp_id, type_metier }
  const res = await client.post('/intervenants/ajouter', data);
  return res.data;
};

// ── Marquer entrée sur site ───────────────────
export const marquerEntree = async (id) => {
  const res = await client.put(`/intervenants/${id}/entree`);
  return res.data;
};

// ── Marquer sortie du site ────────────────────
export const marquerSortie = async (id) => {
  const res = await client.put(`/intervenants/${id}/sortie`);
  return res.data;
};

// ── Supprimer un intervenant ──────────────────
export const supprimerIntervenant = async (id) => {
  const res = await client.delete(`/intervenants/${id}`);
  return res.data;
};