import client from './client';

export const creerDemande = async (data) => {
  const res = await client.post('/demandes', data);
  return res.data;
};

export const getMesDemandes = async (statut = null) => {
  const params = statut ? { statut } : {};
  const res = await client.get('/demandes/mes-demandes', { params });
  return res.data;
};

export const getDemandeById = async (id) => {
  const res = await client.get(`/demandes/${id}`);
  return res.data;
};

// Récupérer tous les lots
export const getLots = async () => {
  const res = await client.get('/lots');
  return res.data;
};

// Équipements filtrés par lot
export const getEquipementsParLot = async (lotId) => {
  const res = await client.get(`/lots/${lotId}/equipements`);
  return res.data;
};