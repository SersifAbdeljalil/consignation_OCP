// src/routes/charge.routes.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/charge.controller');
const auth    = require('../middlewares/auth.middleware');
const role    = require('../middlewares/role.middleware');
const CHARGE  = role(['charge_consignation']);

// GET  /api/charge/demandes           → Liste demandes à consigner
router.get('/demandes',                    auth, CHARGE, ctrl.getDemandesAConsigner);

// GET  /api/charge/demandes/:id/pdf   → Servir le PDF de consignation ✅ AJOUTÉ
router.get('/demandes/:id/pdf',            auth, ctrl.servirPDF);

// GET  /api/charge/demandes/:id        → Détail demande + plan + points
router.get('/demandes/:id',                auth, CHARGE, ctrl.getDemandeDetail);

// POST /api/charge/demandes/:id/demarrer → Démarre consignation
router.post('/demandes/:id/demarrer',      auth, CHARGE, ctrl.demarrerConsignation);

// POST /api/charge/demandes/:id/refuser → Refuser la demande
router.post('/demandes/:id/refuser',       auth, CHARGE, ctrl.refuserDemande);

// POST /api/charge/demandes/:id/suspendre → Mettre en attente
router.post('/demandes/:id/suspendre',     auth, CHARGE, ctrl.mettreEnAttente);

// POST /api/charge/points/:pointId/cadenas → Scan NFC cadenas (point prédéfini)
router.post('/points/:pointId/cadenas',    auth, CHARGE, ctrl.scannerCadenas);

// POST /api/charge/cadenas-libre → Cadenas sans point prédéfini
router.post('/cadenas-libre',              auth, CHARGE, ctrl.scannerCadenasLibre);

// POST /api/charge/demandes/:id/photo  → Enregistre la photo
router.post('/demandes/:id/photo',         auth, CHARGE, ctrl.enregistrerPhoto);

// POST /api/charge/demandes/:id/valider → Validation finale + PDF + notifications
router.post('/demandes/:id/valider',       auth, CHARGE, ctrl.validerConsignation);

// GET  /api/charge/historique           → Historique du chargé
router.get('/historique',                  auth, CHARGE, ctrl.getHistorique);

module.exports = router;