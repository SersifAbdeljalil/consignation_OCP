// src/routes/charge.routes.js
// ✅ FIX : servirPDF sans restriction de rôle (accessible agent aussi)
// ✅ NOUVEAU : demandes-a-deconsigner + /deconsigner
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/charge.controller');
const auth    = require('../middlewares/auth.middleware');
const role    = require('../middlewares/role.middleware');
const CHARGE  = role(['charge_consignation']);

router.get('/demandes',                    auth, CHARGE, ctrl.getDemandesAConsigner);
router.get('/demandes-a-deconsigner',      auth, CHARGE, ctrl.getDemandesADeconsigner);      // ✅ NOUVEAU
router.get('/demandes/:id/pdf',            auth,         ctrl.servirPDF);                    // ✅ FIX sans rôle
router.get('/demandes/:id',                auth, CHARGE, ctrl.getDemandeDetail);
router.post('/demandes/:id/demarrer',      auth, CHARGE, ctrl.demarrerConsignation);
router.post('/demandes/:id/refuser',       auth, CHARGE, ctrl.refuserDemande);
router.post('/demandes/:id/suspendre',     auth, CHARGE, ctrl.mettreEnAttente);
router.post('/points/:pointId/cadenas',    auth, CHARGE, ctrl.scannerCadenas);
router.post('/cadenas-libre',              auth, CHARGE, ctrl.scannerCadenasLibre);
router.post('/demandes/:id/photo',         auth, CHARGE, ctrl.enregistrerPhoto);
router.post('/demandes/:id/valider',       auth, CHARGE, ctrl.validerConsignation);
router.post('/demandes/:id/deconsigner',   auth, CHARGE, ctrl.validerDeconsignationFinale);  // ✅ NOUVEAU
router.get('/historique',                  auth, CHARGE, ctrl.getHistorique);

module.exports = router;