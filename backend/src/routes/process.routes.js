// src/routes/process.routes.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/process.controller');
const auth    = require('../middlewares/auth.middleware');
const role    = require('../middlewares/role.middleware');

const PROCESS = role(['chef_process']);

// Demandes
router.get('/demandes',                 auth, PROCESS, ctrl.getDemandesAConsigner);
router.get('/demandes/:id/pdf',         auth,          ctrl.servirPDF);
router.get('/demandes/:id',             auth, PROCESS, ctrl.getDemandeDetail);
router.post('/demandes/:id/demarrer',   auth, PROCESS, ctrl.demarrerConsignation);
router.post('/demandes/:id/valider',    auth, PROCESS, ctrl.validerConsignation);

// Points process
router.post('/points/:pointId/cadenas', auth, PROCESS, ctrl.scannerCadenas);
router.post('/cadenas-libre',           auth, PROCESS, ctrl.scannerCadenasLibre);

// Historique
router.get('/historique',               auth, PROCESS, ctrl.getHistorique);

module.exports = router;