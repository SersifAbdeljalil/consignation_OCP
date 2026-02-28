// src/routes/lot.routes.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/lot.controller');
const auth    = require('../middlewares/auth.middleware');

// GET /api/lots
router.get('/', auth, ctrl.getLots);

// GET /api/lots/:id/equipements
// ✅ Retourne maintenant : raison_predefinie + has_process + has_electricien
router.get('/:id/equipements', auth, ctrl.getEquipementsParLot);

// ✅ NOUVELLE ROUTE : GET /api/lots/equipement/:equipement_id/plan-predefini
// Appelée par le frontend dès qu'un TAG est sélectionné
// → retourne raison auto + lignes electricien + lignes process
router.get('/equipement/:equipement_id/plan-predefini', auth, ctrl.getPlanPredefini);

module.exports = router;