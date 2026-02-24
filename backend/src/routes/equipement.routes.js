// src/routes/equipement.routes.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/user.controller');
const auth    = require('../middlewares/auth.middleware');

router.get('/', auth, ctrl.getEquipements);

module.exports = router;