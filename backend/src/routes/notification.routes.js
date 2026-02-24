const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/notification.controller');
const pushCtrl = require('../controllers/pushNotification.controller');
const auth     = require('../middlewares/auth.middleware');

// ── Notifications in-app ───────────────────────────────────
router.get   ('/',            auth, ctrl.getNotifications);
router.get   ('/count',       auth, ctrl.getNonLuesCount);
router.put   ('/toutes-lues', auth, ctrl.marquerToutesLues);
router.put   ('/:id/lu',      auth, ctrl.marquerCommeLue);
router.delete('/:id',         auth, ctrl.supprimerNotification);

// ── Push tokens ────────────────────────────────────────────
router.post  ('/enregistrer-token', auth, pushCtrl.enregistrerToken);
router.delete('/supprimer-token',   auth, pushCtrl.supprimerToken);

module.exports = router;