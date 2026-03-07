// src/routes/equipeIntervention.routes.js
'use strict';

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();
const auth    = require('../middlewares/auth.middleware');

const {
  getMesMembres,
  getEquipe,
  getIntervenantsDispos,
  enregistrerMembre,
  supprimerMembre,           // ← FIX : était absent
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

// ── Multer — upload photo membre ──────────────────────────────────
const uploadsDir = path.join(__dirname, '../../uploads/membres');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname) || '.jpg';
    const name = `membre_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Image JPEG/PNG uniquement'));
  },
});

// ── Auth global ───────────────────────────────────────────────────
router.use(auth);

// ── Lecture ───────────────────────────────────────────────────────
router.get('/mes-membres',                         getMesMembres);
router.get('/:demande_id/statut-deconsignation',   getStatutDeconsignation);
router.get('/:demande_id/intervenants-dispos',     getIntervenantsDispos);
router.get('/:demande_id/rapport',                 getRapport);
router.get('/:demande_id',                         getEquipe);

// ── Vérifications ─────────────────────────────────────────────────
router.post('/membre/verifier-badge',              verifierBadge);
router.post('/membre/verifier-cadenas',            verifierCadenas);

// ── Enregistrement membre (multipart/form-data avec photo) ────────
router.post('/membre',                             upload.single('photo'), enregistrerMembre);

// ── Suppression membre ────────────────────────────────────────────
// FIX : route DELETE manquante — causait l'erreur lors du "Retirer"
router.delete('/membre/:id',                       supprimerMembre);

// ── Validation équipe + entrée site ──────────────────────────────
router.post('/:demande_id/valider',                validerEquipe);
router.post('/:demande_id/entree-site',            marquerEntreeMembres);

// ── Déconsignation finale ─────────────────────────────────────────
router.post('/:demande_id/valider-deconsignation', validerDeconsignation);

// ── Mises à jour membres ──────────────────────────────────────────
router.put('/membre/:id/cadenas',                  mettreAJourCadenas);
router.put('/membre/:id/deconsigner',              deconsignerMembre);
router.put('/membre/:id/entree',                   marquerEntree);
router.put('/membre/:id/sortie',                   marquerSortie);

module.exports = router;