// src/routes/auth.routes.js
const express        = require('express');
const router         = express.Router();
const authCtrl       = require('../controllers/auth.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.post('/login',           authCtrl.login);
router.get('/me',               authMiddleware, authCtrl.me);
router.put('/change-password',  authMiddleware, authCtrl.changerMotDePasse);

module.exports = router;