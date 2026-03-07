// src/routes/equipeIntervention.routes.js
const express = require('express');
const router  = express.Router();
const auth    = require('../middlewares/auth.middleware');
const ctrl    = require('../controllers/equipeIntervention.controller');

// ⚠️ IMPORTANT : routes statiques AVANT routes dynamiques /:param

// ── GET ──────────────────────────────────────────────────────
router.get('/mes-membres',                          auth, ctrl.getMesMembres);
router.get('/:demande_id/statut-deconsignation',    auth, ctrl.getStatutDeconsignation);
router.get('/:demande_id/intervenants-dispos',      auth, ctrl.getIntervenantsDispos);
router.get('/:demande_id',                          auth, ctrl.getEquipe);

// ── POST ─────────────────────────────────────────────────────
router.post('/membre/verifier-badge',               auth, ctrl.verifierBadge);
router.post('/membre',                              auth, ctrl.enregistrerMembre);
router.post('/:demande_id/valider',                 auth, ctrl.validerEquipe);
router.post('/:demande_id/entree-site',             auth, ctrl.marquerEntreeMembres); // ← NOUVEAU P2

// ── PUT ──────────────────────────────────────────────────────
router.put('/membre/:id/cadenas',                   auth, ctrl.mettreAJourCadenas);
router.put('/membre/:id/deconsigner',               auth, ctrl.deconsignerMembre);
router.put('/membre/:id/entree',                    auth, ctrl.marquerEntree);
router.put('/membre/:id/sortie',                    auth, ctrl.marquerSortie);

module.exports = router;