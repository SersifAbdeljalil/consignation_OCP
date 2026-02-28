// src/routes/index.js
// ✅ Mise à jour avec la route process
//
const express = require("express");
const router  = express.Router();

router.use("/auth",          require("./auth.routes"));
router.use("/users",         require("./user.routes"));
router.use('/equipements',   require('./equipement.routes'));
router.use('/lots',          require('./lot.routes'));
router.use('/demandes',      require('./demande.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/intervenants',  require('./intervenant.routes'));
router.use('/charge',        require('./charge.routes'));   // ✅ Chargé de consignation
router.use('/process',       require('./process.routes'));  // ✅ Chef Process

module.exports = router;