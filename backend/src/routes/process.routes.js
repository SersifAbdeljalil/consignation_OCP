// src/routes/process.routes.js
// ✅ FIX : servirPDF sans restriction de rôle
// ✅ NOUVEAU : demandes-a-deconsigner + /deconsigner
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/process.controller');
const auth    = require('../middlewares/auth.middleware');
const role    = require('../middlewares/role.middleware');
const PROCESS = role(['chef_process']);

router.get('/demandes',                   auth, PROCESS, ctrl.getDemandesAConsigner);
router.get('/demandes-a-deconsigner',     auth, PROCESS, ctrl.getDemandesADeconsigner);     // ✅ NOUVEAU
router.get('/demandes/:id/pdf',           auth,          ctrl.servirPDF);                   // ✅ FIX sans rôle
router.get('/demandes/:id',               auth, PROCESS, ctrl.getDemandeDetail);
router.post('/demandes/:id/demarrer',     auth, PROCESS, ctrl.demarrerConsignation);
router.post('/demandes/:id/valider',      auth, PROCESS, ctrl.validerConsignation);
router.post('/demandes/:id/deconsigner',  auth, PROCESS, ctrl.validerDeconsignationFinale); // ✅ NOUVEAU
router.post('/points/:pointId/cadenas',   auth, PROCESS, ctrl.scannerCadenas);
router.post('/cadenas-libre',             auth, PROCESS, ctrl.scannerCadenasLibre);
router.get('/historique',                 auth, PROCESS, ctrl.getHistorique);
router.post('/deconsigner-point/:pointId', auth, PROCESS, ctrl.deconsignerPointProcess);
module.exports = router;