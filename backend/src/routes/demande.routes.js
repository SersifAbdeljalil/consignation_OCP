// src/routes/demande.routes.js
const express        = require('express');
const router         = express.Router();
const ctrl           = require('../controllers/demande.controller');
const auth           = require('../middlewares/auth.middleware');
const role           = require('../middlewares/role.middleware');

router.post('/',              auth, role('agent_production'), ctrl.creerDemande);
router.get('/mes-demandes',   auth, role('agent_production'), ctrl.getMesDemandes);
router.get('/:id',            auth, ctrl.getDemandeById);

module.exports = router;

// ─────────────────────────────────────────────
// src/routes/notification.routes.js
// ─────────────────────────────────────────────