// À ajouter dans votre fichier de routes (ex: routes/equipeIntervention.routes.js)
// ⚠️ IMPORTANT : /mes-membres doit être déclaré AVANT /:demande_id

const express = require('express');
const router  = express.Router();
const auth           = require('../middlewares/auth.middleware');
const ctrl    = require('../controllers/equipeIntervention.controller');

// ── GET ──
router.get('/mes-membres',           auth, ctrl.getMesMembres);     // ← AVANT /:demande_id
router.get('/:demande_id',           auth, ctrl.getEquipe);

// ── POST ──
router.post('/membre',               auth, ctrl.enregistrerMembre);
router.post('/:demande_id/valider',  auth, ctrl.validerEquipe);

// ── PUT ──
router.put('/membre/:id/entree',     auth, ctrl.marquerEntree);
router.put('/membre/:id/sortie',     auth, ctrl.marquerSortie);

module.exports = router;