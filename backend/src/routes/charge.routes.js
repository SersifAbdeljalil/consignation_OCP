// src/routes/charge.routes.js
// ✅ NOUVEAU : Routes déconsignation chargé
//   - GET  /demandes/:id/deconsignation-detail  → détail + cadenas à déconsigner
//   - POST /demandes/:id/scanner-decons-cadenas → scan cadenas déconsignation
//   - POST /demandes/:id/deconsigner            → validation finale (badge obligatoire)

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/charge.controller');
const auth    = require('../middlewares/auth.middleware');
const role    = require('../middlewares/role.middleware');
const CHARGE  = role(['charge_consignation']);

// ── Consignation ──────────────────────────────────────────────────
router.get('/demandes',                              auth, CHARGE, ctrl.getDemandesAConsigner);
router.get('/demandes-a-deconsigner',                auth, CHARGE, ctrl.getDemandesADeconsigner);
router.get('/demandes/:id/pdf',                      auth,         ctrl.servirPDF);
router.get('/demandes/:id',                          auth, CHARGE, ctrl.getDemandeDetail);
router.post('/demandes/:id/demarrer',                auth, CHARGE, ctrl.demarrerConsignation);
router.post('/demandes/:id/refuser',                 auth, CHARGE, ctrl.refuserDemande);
router.post('/demandes/:id/suspendre',               auth, CHARGE, ctrl.mettreEnAttente);
router.post('/points/:pointId/cadenas',              auth, CHARGE, ctrl.scannerCadenas);
router.post('/cadenas-libre',                        auth, CHARGE, ctrl.scannerCadenasLibre);
router.post('/demandes/:id/photo',                   auth, CHARGE, ctrl.enregistrerPhoto);
router.post('/demandes/:id/valider',                 auth, CHARGE, ctrl.validerConsignation);
router.get('/historique',                            auth, CHARGE, ctrl.getHistorique);

// ── Déconsignation ────────────────────────────────────────────────
// 1. Voir les détails de la déconsignation (points + état cadenas)
router.get('/demandes/:id/deconsignation-detail',    auth, CHARGE, ctrl.getDemandeDeconsignationDetail);

// 2. Scanner un cadenas lors de la déconsignation (vérification correspondance)
router.post('/demandes/:id/scanner-decons-cadenas',  auth, CHARGE, ctrl.scannerCadenasDeconsignation);

// 3. Valider la déconsignation finale (badge obligatoire)
router.post('/demandes/:id/deconsigner',             auth, CHARGE, ctrl.validerDeconsignationFinale);

module.exports = router;