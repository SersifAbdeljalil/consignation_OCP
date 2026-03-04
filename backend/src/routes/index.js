// src/routes/index.js
const express = require("express");
const router  = express.Router();

router.use("/auth",                 require("./auth.routes"));
router.use("/users",                require("./user.routes"));
router.use('/equipements',          require('./equipement.routes'));
router.use('/lots',                 require('./lot.routes'));
router.use('/demandes',             require('./demande.routes'));
router.use('/notifications',        require('./notification.routes'));
router.use('/intervenants',         require('./intervenant.routes'));
router.use('/charge',               require('./charge.routes'));
router.use('/process',              require('./process.routes'));
router.use('/equipe-intervention',  require('./equipeIntervention.routes')); // ✅ Équipes chantier

module.exports = router;