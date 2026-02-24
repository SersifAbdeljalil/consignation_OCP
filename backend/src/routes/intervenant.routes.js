// src/routes/intervenant.routes.js
const express   = require('express');
const router    = express.Router();
const ctrl      = require('../controllers/intervenant.controller');
const auth      = require('../middlewares/auth.middleware');
const role      = require('../middlewares/role.middleware');

// Rôles autorisés pour toutes ces routes
const CHEFS = role(['chef_genie_civil','chef_mecanique','chef_electrique','chef_process']);

// GET  /api/intervenants/mes-demandes           → Demandes concernant mon type_metier
router.get('/mes-demandes',                auth, CHEFS, ctrl.getMesDemandes);

// GET  /api/intervenants/mes-intervenants       → Mon équipe
router.get('/mes-intervenants',            auth, CHEFS, ctrl.getMesIntervenants);

// GET  /api/intervenants/autorisation/:id       → Détail autorisation d'une demande
router.get('/autorisation/:demande_id',    auth, CHEFS, ctrl.getAutorisation);

// POST /api/intervenants/ajouter                → Ajouter un membre à mon équipe
router.post('/ajouter',                    auth, CHEFS, ctrl.ajouterIntervenant);

// PUT  /api/intervenants/:id/entree             → Marquer entrée site
router.put('/:id/entree',                  auth, CHEFS, ctrl.marquerEntree);

// PUT  /api/intervenants/:id/sortie             → Marquer sortie site
router.put('/:id/sortie',                  auth, CHEFS, ctrl.marquerSortie);

// DELETE /api/intervenants/:id                  → Supprimer un intervenant
router.delete('/:id',                      auth, CHEFS, ctrl.supprimerIntervenant);

module.exports = router;