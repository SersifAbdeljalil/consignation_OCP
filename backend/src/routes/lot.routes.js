const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/lot.controller');
const auth    = require('../middlewares/auth.middleware');

router.get('/',                    auth, ctrl.getLots);
router.get('/:id/equipements',     auth, ctrl.getEquipementsParLot);

module.exports = router;