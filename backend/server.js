// server.js
require('dotenv').config();
const express        = require('express');
const cors           = require('cors');
const helmet         = require('helmet');
const routes         = require('./src/routes/index');
const errorMiddleware = require('./src/middlewares/error.middleware');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middlewares globaux ───────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────
app.use('/api', routes);

// ─── Route de test ────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ message: '✅ API Consignation KOFERT - Opérationnelle' });
});

// ─── Middleware erreurs ───────────────────────────────────
app.use(errorMiddleware);

// ─── Démarrage ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});