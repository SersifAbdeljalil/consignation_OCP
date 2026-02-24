// src/middlewares/error.middleware.js
const errorMiddleware = (err, req, res, next) => {
  console.error('❌ Erreur :', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Erreur serveur interne',
    data: null,
  });
};

module.exports = errorMiddleware;