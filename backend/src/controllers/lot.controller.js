// src/controllers/lot.controller.js
const db = require('../config/db');
const { success, error } = require('../utils/response');

// GET /lots — liste tous les lots actifs
const getLots = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, code, description FROM lots WHERE actif = 1 ORDER BY code'
    );
    return success(res, rows, 'Lots récupérés');
  } catch (err) {
    console.error('getLots error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// GET /lots/:id/equipements — équipements d'un lot
// ✅ MODIFIÉ : + raison_predefinie + has_process + has_electricien
const getEquipementsParLot = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      `SELECT
         e.id,
         e.code_equipement,
         e.nom,
         e.localisation,
         e.type,
         e.raison_predefinie,
         CASE WHEN EXISTS (
           SELECT 1 FROM plans_predefinis pp
           WHERE pp.equipement_id = e.id AND pp.charge_type = 'process'
         ) THEN 1 ELSE 0 END AS has_process,
         CASE WHEN EXISTS (
           SELECT 1 FROM plans_predefinis pp
           WHERE pp.equipement_id = e.id AND pp.charge_type = 'electricien'
         ) THEN 1 ELSE 0 END AS has_electricien
       FROM equipements e
       WHERE e.lot_id = ? AND e.actif = 1
       ORDER BY e.nom`,
      [id]
    );
    return success(res, rows, 'Équipements du lot récupérés');
  } catch (err) {
    console.error('getEquipementsParLot error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// GET /lots/equipement/:equipement_id/plan-predefini
// ✅ NOUVEAU : retourne le plan complet séparé par type (electricien / process)
const getPlanPredefini = async (req, res) => {
  try {
    const { equipement_id } = req.params;
    const [rows] = await db.query(
      `SELECT
         pp.*,
         e.raison_predefinie,
         e.nom       AS equipement_nom,
         e.code_equipement AS tag
       FROM plans_predefinis pp
       JOIN equipements e ON pp.equipement_id = e.id
       WHERE pp.equipement_id = ?
       ORDER BY pp.numero_ligne ASC`,
      [equipement_id]
    );

    const lignesElectricien = rows.filter(r => r.charge_type === 'electricien');
    const lignesProcess     = rows.filter(r => r.charge_type === 'process');
    const raisonPredefinie  = rows.length > 0 ? rows[0].raison_predefinie : null;

    return success(res, {
      equipement_id:      parseInt(equipement_id),
      raison_predefinie:  raisonPredefinie,
      has_process:        lignesProcess.length > 0,
      has_electricien:    lignesElectricien.length > 0,
      total_lignes:       rows.length,
      lignes_electricien: lignesElectricien,
      lignes_process:     lignesProcess,
      toutes_lignes:      rows,
    }, 'Plan prédéfini récupéré');
  } catch (err) {
    console.error('getPlanPredefini error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

module.exports = { getLots, getEquipementsParLot, getPlanPredefini };