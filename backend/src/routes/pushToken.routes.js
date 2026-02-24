// src/routes/pushToken.routes.js
const express = require('express');
const router  = express.Router();
const { verifierToken } = require('../middlewares/auth.middleware'); // ← nom à vérifier
const {
  enregistrerToken,
  supprimerToken,
} = require('../controllers/pushNotification.controller');

router.post('/register',   verifierToken, enregistrerToken);
router.post('/unregister', verifierToken, supprimerToken);

module.exports = router;