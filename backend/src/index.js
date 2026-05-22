require('dotenv').config();
const express = require('express');
const cors = require('cors');
const librosRoutes = require('./routes/libros');
const categoriasRoutes = require('./routes/categorias');
const discordRoutes = require('./routes/discord');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());

// Raw body capture para Discord (antes de express.json(), necesario para verificar firma)
// Consumimos el stream manualmente y marcamos _body=true para que express.json() lo saltee
app.use('/api/discord/interactions', (req, res, next) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    req.rawBody = Buffer.concat(chunks).toString('utf8');
    req._body = true; // le dice a body-parser que ya procesamos el body
    next();
  });
});

app.use(express.json());

// Rutas
app.use('/api/libros', librosRoutes);
app.use('/api/categorias', categoriasRoutes);
app.use('/api/discord', discordRoutes);

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ 
    mensaje: 'API Azara funcionando 🦎',
    version: '1.0.0',
    endpoints: {
      libros: '/api/libros',
      categorias: '/api/categorias',
      stats: '/api/libros/stats/general',
      discord: '/api/discord/interactions'
    }
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
