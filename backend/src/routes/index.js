const express = require("express");
const router  = express.Router();

router.use("/auth",          require("./auth.routes"));
router.use("/users",         require("./user.routes"));
router.use('/equipements',   require('./equipement.routes'));
router.use('/lots',          require('./lot.routes'));
router.use('/demandes',      require('./demande.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/intervenants',  require('./intervenant.routes')); // ← NOUVEAU

module.exports = router;