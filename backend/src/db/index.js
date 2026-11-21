/**
 * db/index.js — Pool de conexiones a PostgreSQL.
 *
 * Un POOL es un grupo de conexiones reutilizables. En vez de abrir y cerrar
 * una conexión por cada request (carísimo), el pool mantiene unas pocas
 * abiertas y las presta. Analogía: antes llamábamos un taxi por cada viaje;
 * ahora tenemos una parada con 10 taxis esperando.
 *
 * Este archivo crea el pool. Lo usa `queries.js` cuando USE_PG=true; en modo
 * JSON `datos.js` lo requiere de forma LAZY, así que no se abre conexión.
 */

require('dotenv').config();

const { Pool } = require('pg');

// Fail-fast: si falta la URL, mejor reventar acá que en medio de un request.
// Ojo: no logueamos el valor, porque contiene la password de azarae_user.
if (!process.env.DATABASE_URL) {
  throw new Error('Falta DATABASE_URL. Copiá backend/.env.example a backend/.env y completala.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,                      // máximo de conexiones abiertas (default de pg)
  idleTimeoutMillis: 30000,     // a los 30s sin uso, cerrar esa conexión
  connectionTimeoutMillis: 2000 // si no conecta en 2s, fallar rápido
});

// Un error en una conexión IDLE (por ejemplo, el server reinició) no debe
// matar el proceso. Sin este handler, Node tira un 'error' no manejado.
pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err.message);
});

module.exports = pool;
