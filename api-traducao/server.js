// api-traducao/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// Importar configurações e serviços
const { connectDatabase, testConnection } = require('./src/config/database');
const { connectRabbitMQ, testRabbitMQConnection } = require('./src/config/rabbitmq');
const logger = require('./src/utils/logger');
const errorHandler = require('./src/middleware/errorHandler');

// Importar rotas
const translationRoutes = require('./src/routes/translationRoutes');
const healthRoutes = require('./src/routes/health');

class TranslationAPI {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.server = null;
  }

  async initialize() {
    try {
      logger.info('🚀 Inicializando Translation API...');
      
      await this.setupDatabase();
      await this.setupRabbitMQ();
      this.setupMiddleware();
      this.setupSwagger();
      this.setupRoutes();
      this.setupErrorHandling();
      
      logger.info('✅ Translation API inicializada com sucesso');
    } catch (error) {
      logger.error('❌ Erro ao inicializar API:', error);
      throw error;
    }
  }

  async setupDatabase() {
    try {
      logger.info('🗃️ Conectando ao PostgreSQL...');
      await connectDatabase();
      await testConnection();
      logger.info('✅ Conexão PostgreSQL estabelecida');
    } catch (error) {
      logger.error('❌ Erro ao conectar PostgreSQL:', error);
      throw error;
    }
  }

  async setupRabbitMQ() {
    try {
      logger.info('🐰 Conectando ao RabbitMQ...');
      await connectRabbitMQ();
      await testRabbitMQConnection();
      logger.info('✅ Conexão RabbitMQ estabelecida');
    } catch (error) {
      logger.error('❌ Erro ao conectar RabbitMQ:', error);
      throw error;
    }
  }

  setupMiddleware() {
    // Segurança
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      credentials: true
    }));

    // Compressão
    this.app.use(compression());

    // Rate Limiting
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
      message: {
        error: 'Too many requests from this IP',
        message: 'Please try again later'
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        // Pular rate limit para health checks
        return req.path === '/health' || req.path === '/api/health';
      }
    });
    this.app.use(limiter);

    // Logging
    const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
    this.app.use(morgan(morganFormat, {
      stream: {
        write: (message) => logger.info(message.trim())
      }
    }));

    // Body parsing
    this.app.use(express.json({ 
      limit: '10mb',
      verify: (req, res, buf) => {
        req.rawBody = buf;
      }
    }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Headers customizados
    this.app.use((req, res, next) => {
      res.set({
        'X-API-Version': process.env.API_VERSION || '1.0.0',
        'X-Powered-By': 'Translation API',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      next();
    });

    // Request ID
    this.app.use((req, res, next) => {
      req.requestId = require('uuid').v4();
      res.set('X-Request-ID', req.requestId);
      logger.info(`Request started: ${req.method} ${req.path}`, {
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });
  }

  setupSwagger() {
    const swaggerDefinition = {
      openapi: '3.0.0',
      info: {
        title: 'Serviço de Tradução API',
        version: process.env.API_VERSION || '1.0.0',
        description: 'API REST para Sistema de Tradução Assíncrona',
        contact: {
          name: 'Translation System Team',
          email: 'support@translation-system.com'
        }
      },
      servers: [
        {
          url: `http://localhost:${this.port}`,
          description: 'Servidor Local'
        },
        {
          url: `http://localhost`,
          description: 'Servidor Nginx (Proxy)'
        }
      ],
      tags: [
        {
          name: 'Translations',
          description: 'Endpoints de tradução'
        },
        {
          name: 'Health',
          description: 'Endpoints de verificação de saúde'
        }
      ],
      components: {
        schemas: {
          Translation: {
            type: 'object',
            required: ['sourceText', 'sourceLanguage', 'targetLanguage'],
            properties: {
              requestId: {
                type: 'string',
                format: 'uuid',
                description: 'ID único da solicitação de tradução'
              },
              sourceText: {
                type: 'string',
                description: 'Texto a ser traduzido'
              },
              sourceLanguage: {
                type: 'string',
                description: 'Código do idioma de origem (ex: pt, en)'
              },
              targetLanguage: {
                type: 'string',
                description: 'Código do idioma de destino (ex: pt, en)'
              },
              translatedText: {
                type: 'string',
                description: 'Texto traduzido (disponível quando completado)'
              },
              status: {
                type: 'string',
                enum: ['queued', 'processing', 'completed', 'failed'],
                description: 'Status atual da tradução'
              },
              createdAt: {
                type: 'string',
                format: 'date-time',
                description: 'Data e hora de criação da solicitação'
              },
              updatedAt: {
                type: 'string',
                format: 'date-time',
                description: 'Data e hora da última atualização'
              }
            }
          }
        }
      }
    };

    const options = {
      swaggerDefinition,
      apis: ['./server.js', './src/routes/*.js'] // Incluir server.js e todos os arquivos de rotas
    };

    const swaggerSpec = swaggerJsdoc(options);
    this.app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));

    // Endpoint para obter a especificação em JSON
    this.app.get('/api/docs.json', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(swaggerSpec);
    });

    logger.info('📚 Swagger UI configurado em /api/docs');
  }

  setupRoutes() {
    // Rota principal
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Translation API',
        version: process.env.API_VERSION || '1.0.0',
        description: 'API para Sistema de Tradução Assíncrona',
        status: 'running',
        timestamp: new Date().toISOString(),
        endpoints: {
          health: '/health',
          translations: '/api/translations',
          docs: '/api/docs'
        }
      });
    });

    // Rotas da API
    this.app.use('/health', healthRoutes);
    this.app.use('/api/health', healthRoutes);
    this.app.use('/api/translations', translationRoutes);

    // Rota 404
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      });
    });
  }

  setupErrorHandling() {
    // Tratamento de erros
    this.app.use(errorHandler);

    // Página de erro 404 personalizada
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      });
    });
  }

  start() {
    this.server = this.app.listen(this.port, () => {
      logger.info(`🚀 API rodando em http://localhost:${this.port}`);
    });

    // Tratamento de sinal de término (SIGINT, SIGTERM)
    const shutdown = async (signal) => {
      logger.info(`📭 Recebido sinal de término (${signal}). Encerrando...`);
      this.server.close(async (err) => {
        if (err) {
          logger.error('❌ Erro ao encerrar o servidor:', err);
          process.exit(1);
        }
        logger.info('✅ Servidor encerrado com sucesso');
        process.exit(0);
      });

      // Tempo limite para encerramento
      setTimeout(() => {
        logger.warn('⏰ Tempo limite para encerramento atingido. Forçando saída...');
        process.exit(1);
      }, 10000); // 10 segundos
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }
}

// Instanciar e iniciar API
const api = new TranslationAPI();

api.initialize()
  .then(() => {
    api.start();
  })
  .catch((error) => {
    logger.error('❌ Erro fatal ao iniciar API:', error);
    process.exit(1);
  });

module.exports = api;