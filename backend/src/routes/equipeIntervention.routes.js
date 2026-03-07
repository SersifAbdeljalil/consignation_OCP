// src/routes/equipeIntervention.routes.js
'use strict';

const express = require('express');
const router  = express.Router();
const auth    = require('../middlewares/auth.middleware');
const {
  getMesMembres,
  getEquipe,
  getIntervenantsDispos,
  enregistrerMembre,
  verifierCadenas,
  mettreAJourCadenas,
  validerEquipe,
  marquerEntreeMembres,
  marquerEntree,
  marquerSortie,
  verifierBadge,
  deconsignerMembre,
  validerDeconsignation,
  getRapport,
  getStatutDeconsignation,
} = require('../controllers/equipeIntervention.controller');

router.use(auth);

// ── Lecture ──────────────────────────────────────────────────────
router.get('/mes-membres',                            getMesMembres);
router.get('/:demande_id/statut-deconsignation',      getStatutDeconsignation);
router.get('/:demande_id/intervenants-dispos',        getIntervenantsDispos);
router.get('/:demande_id/rapport',                    getRapport);
router.get('/:demande_id',                            getEquipe);

// ── Vérifications ────────────────────────────────────────────────
router.post('/membre/verifier-badge',                 verifierBadge);
router.post('/membre/verifier-cadenas',               verifierCadenas);    // ← NOUVEAU

// ── Enregistrement membre ────────────────────────────────────────
router.post('/membre',                                enregistrerMembre);  // cad_id + photo_path gérés

// ── Validation équipe + entrée site ─────────────────────────────
router.post('/:demande_id/valider',                   validerEquipe);
router.post('/:demande_id/entree-site',               marquerEntreeMembres);

// ── Déconsignation finale ────────────────────────────────────────
router.post('/:demande_id/valider-deconsignation',    validerDeconsignation); // ← NOUVEAU

// ── Mises à jour membres ─────────────────────────────────────────
router.put('/membre/:id/cadenas',                     mettreAJourCadenas);  // supporte cad_id
router.put('/membre/:id/deconsigner',                 deconsignerMembre);   // vérif badge+cadenas, heure_scan_sortie
router.put('/membre/:id/entree',                      marquerEntree);
router.put('/membre/:id/sortie',                      marquerSortie);

module.exports = router;