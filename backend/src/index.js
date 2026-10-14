require('dotenv').config();
const express = require('express');
const cors = require('cors');
const catalogoRoutes = require('./routes/catalogo');
const categoriasRoutes = require('./routes/categorias');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/catalogo', catalogoRoutes);
app.use('/api/categorias', categoriasRoutes);

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ 
    mensaje: 'API Azara funcionando 🦎',
    version: '2.0.0',
    endpoints: {
      catalogo: '/api/catalogo',
      categorias: '/api/categorias',
      stats: '/api/catalogo/stats/general'
    }
  });
});

// Iniciar servidor (SOLO si se ejecuta directo, no al importar desde tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  });
}

module.exports = app;
