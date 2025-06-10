const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const translationRoutes = require('./routes/translationRoutes');
const { initializeDatabase } = require('./database/connection');
const { initializeQueue } = require('./queue/translationQueue');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'translation-api',
    timestamp: new Date().toISOString()
  });
});

// Rotas
app.use('/translations', translationRoutes);

// Middleware de tratamento de erros
app.use((error, req, res, next) => {
  console.error('Error:', error);
  
  if (error.isJoi) {
    return res.status(400).json({
      error: 'Validation error',
      details: error.details[0].message
    });
  }
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Rota 404
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

async function startServer() {
  try {
    // Inicializar banco de dados
    await initializeDatabase();
    console.log('✅ Database connected');
    
    // Inicializar fila RabbitMQ
    await initializeQueue();
    console.log('✅ RabbitMQ queue initialized');
    
    // Iniciar servidor
    app.listen(PORT, () => {
      console.log(`🚀 Translation API running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

startServer();