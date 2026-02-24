// src/routes/user.routes.js — ORDRE CORRIGÉ
const express        = require('express');
const router         = express.Router();
const userCtrl       = require('../controllers/user.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const roleMiddleware = require('../middlewares/role.middleware');

// ✅ Routes utilisateur connecté — AVANT les routes /:id
router.put('/telephone',              authMiddleware, userCtrl.updateTelephone);
router.post('/verifier-telephone',    authMiddleware, userCtrl.verifierTelephone);
router.put('/changer-mot-de-passe',   authMiddleware, userCtrl.changerMotDePasse); // ← AVANT /:id

// Routes Admin
router.get('/',                       authMiddleware, roleMiddleware('admin'), userCtrl.getUsers);
router.get('/roles',                  authMiddleware, roleMiddleware('admin'), userCtrl.getRoles);
router.get('/:id',                    authMiddleware, roleMiddleware('admin'), userCtrl.getUserById);
router.post('/',                      authMiddleware, roleMiddleware('admin'), userCtrl.createUser);
router.put('/:id',                    authMiddleware, roleMiddleware('admin'), userCtrl.updateUser);
router.patch('/:id/toggle-actif',     authMiddleware, roleMiddleware('admin'), userCtrl.toggleUserActif);
router.patch('/:id/reset-password',   authMiddleware, roleMiddleware('admin'), userCtrl.resetMotDePasse);

module.exports = router;