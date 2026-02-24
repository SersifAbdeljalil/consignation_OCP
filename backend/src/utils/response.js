// src/utils/response.js
const success = (res, data, message = 'Succès', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const error = (res, message = 'Erreur serveur', statusCode = 500) => {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
  });
};

module.exports = { success, error };