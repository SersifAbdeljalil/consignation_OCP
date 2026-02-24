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
const getEquipementsParLot = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      `SELECT id, code_equipement, nom, localisation, type 
       FROM equipements 
       WHERE lot_id = ? AND actif = 1 
       ORDER BY nom`,
      [id]
    );
    return success(res, rows, 'Équipements du lot récupérés');
  } catch (err) {
    console.error('getEquipementsParLot error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

module.exports = { getLots, getEquipementsParLot };