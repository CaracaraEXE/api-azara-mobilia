require('dotenv').config();
const express = require('express');
const cors = require('cors');
const librosRoutes = require('./routes/libros');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/libros', librosRoutes);

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ 
    mensaje: 'API Azara funcionando 🦎',
    version: '1.0.0',
    endpoints: {
      libros: '/api/libros',
      categorias: '/api/libros/categorias'
    }
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
