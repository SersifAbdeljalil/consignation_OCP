// src/config/db.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+01:00',
});

pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL connecté avec succès');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Erreur connexion MySQL :', err.message);
    process.exit(1);
  });

module.exports = pool;