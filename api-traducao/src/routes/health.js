const express = require('express');
const router = express.Router();
const { testConnection } = require('../config/database');
const { testRabbitMQConnection } = require('../config/rabbitmq');
const logger = require('../utils/logger');

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Verificação básica de saúde da API
 *     tags: [Health]
 */
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Translation API',
    version: process.env.API_VERSION || '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// GET /health/detailed - Verificação detalhada (banco de dados e RabbitMQ)
router.get('/detailed', async (req, res) => {
  try {
    const healthResults = {
      status: 'ok',
      service: 'Translation API',
      version: process.env.API_VERSION || '1.0.0',
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: 'pending' },
        rabbitmq: { status: 'pending' },
      }
    };

    try {
      await testConnection();
      healthResults.checks.database = {
        status: 'ok',
        message: 'Database connection is healthy'
      };
    } catch (dbError) {
      healthResults.status = 'error';
      healthResults.checks.database = {
        status: 'error',
        message: 'Database connection failed',
        error: dbError.message
      };
      logger.error('❌ Erro na verificação de saúde do banco de dados:', dbError);
    }

    try {
      await testRabbitMQConnection();
      healthResults.checks.rabbitmq = {
        status: 'ok',
        message: 'RabbitMQ connection is healthy'
      };
    } catch (mqError) {
      healthResults.status = 'error';
      healthResults.checks.rabbitmq = {
        status: 'error',
        message: 'RabbitMQ connection failed',
        error: mqError.message
      };
      logger.error('❌ Erro na verificação de saúde do RabbitMQ:', mqError);
    }

    const statusCode = healthResults.status === 'ok' ? 200 : 500;
    res.status(statusCode).json(healthResults);
  } catch (error) {
    logger.error('❌ Erro na verificação de saúde detalhada:', error);
    res.status(500).json({
      status: 'error',
      message: 'Detailed health check failed',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: Verificação de liveness (para kubernetes/container orchestration)
 *     tags: [Health]
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Service is live',
    timestamp: new Date().toISOString()
  });
});

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Verificação de readiness (para kubernetes/container orchestration)
 *     tags: [Health]
 */
router.get('/ready', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Service is ready',
    timestamp: new Date().toISOString()
  });
});

module.exports = router; 