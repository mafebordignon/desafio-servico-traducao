const amqp = require('amqplib');
const Translation = require('../models/Translation');
const logger = require('../utils/logger');

class QueueConsumer {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.queueName = process.env.TRANSLATION_QUEUE || 'translation_queue';
  }

  async connect() {
    try {
      const rabbitMQUrl = process.env.RABBITMQ_URL || 'amqp://localhost';
      logger.info(`🐰 Conectando ao RabbitMQ em ${rabbitMQUrl}...`);
      
      this.connection = await amqp.connect(rabbitMQUrl);
      this.channel = await this.connection.createChannel();
      
      await this.channel.assertQueue(this.queueName, { durable: true });
      logger.info(`✅ Conexão com RabbitMQ estabelecida, fila "${this.queueName}" configurada`);
    } catch (error) {
      logger.error('❌ Erro ao conectar ao RabbitMQ:', error);
      throw error;
    }
  }

  setupGracefulShutdown() {
    process.on('SIGINT', this.shutdown.bind(this));
    process.on('SIGTERM', this.shutdown.bind(this));
    logger.info('✅ Configuração de encerramento gracioso estabelecida');
  }

  async shutdown(signal) {
    logger.info(`📭 Recebido sinal de término (${signal}). Encerrando...`);
    
    if (this.channel) {
      await this.channel.close();
      logger.info('✅ Canal RabbitMQ fechado');
    }
    
    if (this.connection) {
      await this.connection.close();
      logger.info('✅ Conexão RabbitMQ encerrada');
    }
    
    process.exit(0);
  }

  async startConsuming(processingFunction) {
    if (!this.channel) {
      throw new Error('Canal RabbitMQ não inicializado. Conecte-se primeiro!');
    }

    logger.info(`🔄 Consumindo mensagens da fila "${this.queueName}"`);
    
    this.channel.prefetch(1); // Processa uma mensagem por vez
    
    this.channel.consume(this.queueName, async (msg) => {
      if (msg !== null) {
        try {
          await processingFunction(msg);
        } catch (error) {
          logger.error('❌ Erro ao processar mensagem:', error);
          this.channel.nack(msg, false, true); // Recolocar na fila para tentar novamente
        }
      }
    });
  }

  async processTranslationMessage(msg) {
    try {
      const messageContent = JSON.parse(msg.content.toString());
      logger.info(`📥 Mensagem recebida: ${JSON.stringify(messageContent)}`);
      
      // Atualizar status para 'processing'
      await Translation.updateStatus(messageContent.requestId, 'processing');
      
      // Processar a tradução (simulação)
      const translatedText = `Tradução de "${messageContent.sourceText}" de ${messageContent.sourceLanguage} para ${messageContent.targetLanguage}`;
      
      // Simular tempo de processamento
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Atualizar com a tradução concluída
      await Translation.updateStatus(messageContent.requestId, 'completed', { translatedText });
      
      logger.info(`✅ Tradução processada com sucesso: ${messageContent.requestId}`);
      this.channel.ack(msg); // Confirmação de processamento
    } catch (error) {
      logger.error('❌ Erro ao processar tradução:', error);
      
      // Tentar atualizar o status para 'failed'
      try {
        if (messageContent && messageContent.requestId) {
          await Translation.updateStatus(messageContent.requestId, 'failed', {
            errorMessage: error.message
          });
        }
      } catch (dbError) {
        logger.error('❌ Erro ao atualizar status da tradução:', dbError);
      }
      
      throw error; // Propagar erro para ser tratado no startConsuming
    }
  }
}

module.exports = QueueConsumer;