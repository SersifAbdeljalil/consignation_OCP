// src/routes/demande.routes.js
//
// ✅ FIX — Ajout route manquante :
//   POST /:id/demander-deconsignation
//   → Cette route existait dans le controller mais PAS dans le router
//   → Causait "Impossible de joindre le serveur" côté frontend

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/demande.controller');
const auth    = require('../middlewares/auth.middleware');
const role    = require('../middlewares/role.middleware');

router.post('/',                                  auth, role('agent_production'), ctrl.creerDemande);
router.get('/mes-demandes',                       auth, role('agent_production'), ctrl.getMesDemandes);
router.get('/:id',                                auth, ctrl.getDemandeById);

// ✅ ROUTE MANQUANTE — existait dans le controller mais pas enregistrée ici
router.post('/:id/demander-deconsignation',       auth, role('agent_production'), ctrl.demanderDeconsignation);

module.exports = router;