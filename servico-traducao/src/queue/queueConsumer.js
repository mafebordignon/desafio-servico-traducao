// servico-traducao/src/queue/queueConsumer.js
const amqp = require('amqplib');
const Translation = require('../models/Translation');

class QueueConsumer {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.queueName = 'translation_queue';
  }

  async connect() {
    try {
      // Conectar ao RabbitMQ
      this.connection = await amqp.connect(
        process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'
      );
      
      this.channel = await this.connection.createChannel();
      
      // Declarar a fila (garante que existe)
      await this.channel.assertQueue(this.queueName, {
        durable: true // Fila persistente
      });

      // Configurar prefetch para processar uma mensagem por vez
      await this.channel.prefetch(1);

      console.log('✅ Conectado ao RabbitMQ');
      console.log(`📨 Aguardando mensagens na fila: ${this.queueName}`);

    } catch (error) {
      console.error('❌ Erro ao conectar RabbitMQ:', error);
      throw error;
    }
  }

  async startConsuming(messageHandler) {
    try {
      if (!this.channel) {
        throw new Error('Canal RabbitMQ não inicializado');
      }

      // Consumir mensagens da fila
      await this.channel.consume(this.queueName, async (msg) => {
        if (msg !== null) {
          try {
            // Parse da mensagem
            const messageContent = JSON.parse(msg.content.toString());
            console.log('📥 Mensagem recebida:', messageContent);

            // Processar mensagem
            await messageHandler(messageContent);

            // Confirmar processamento (ACK)
            this.channel.ack(msg);
            console.log('✅ Mensagem processada com sucesso');

          } catch (error) {
            console.error('❌ Erro ao processar mensagem:', error);
            
            // Rejeitar mensagem e reenviar para fila
            this.channel.nack(msg, false, true);
          }
        }
      });

    } catch (error) {
      console.error('❌ Erro ao iniciar consumo:', error);
      throw error;
    }
  }

  async updateTranslationStatus(requestId, status, translatedText = null, error = null) {
    try {
      const updateData = {
        status,
        updatedAt: new Date()
      };

      if (translatedText) {
        updateData.translatedText = translatedText;
      }

      if (error) {
        updateData.error = error;
      }

      await Translation.findOneAndUpdate(
        { requestId },
        updateData,
        { new: true }
      );

      console.log(`📝 Status atualizado para ${requestId}: ${status}`);

    } catch (error) {
      console.error('❌ Erro ao atualizar status:', error);
      throw error;
    }
  }

  async processTranslationMessage(message) {
    const { requestId, text, sourceLanguage, targetLanguage } = message;

    try {
      console.log(`🔄 Iniciando tradução para request: ${requestId}`);

      // Atualizar status para "processing"
      await this.updateTranslationStatus(requestId, 'processing');

      // Simular tradução (ou usar serviço real)
      const translatedText = await this.translateText(text, sourceLanguage, targetLanguage);

      // Atualizar status para "completed" com o texto traduzido
      await this.updateTranslationStatus(requestId, 'completed', translatedText);

      console.log(`✅ Tradução concluída para request: ${requestId}`);

    } catch (error) {
      console.error(`❌ Erro na tradução para request ${requestId}:`, error);

      // Atualizar status para "failed" com o erro
      await this.updateTranslationStatus(requestId, 'failed', null, error.message);
    }
  }

  async translateText(text, sourceLanguage, targetLanguage) {
    // Simulação de tradução - substitua por serviço real
    console.log(`🌐 Traduzindo "${text}" de ${sourceLanguage} para ${targetLanguage}`);

    // Simular delay de processamento
    await this.delay(2000);

    // Dicionário mockado para demonstração
    const translations = {
      'en-pt': {
        'hello': 'olá',
        'world': 'mundo',
        'good morning': 'bom dia',
        'thank you': 'obrigado',
        'please': 'por favor',
        'yes': 'sim',
        'no': 'não'
      },
      'pt-en': {
        'olá': 'hello',
        'mundo': 'world',
        'bom dia': 'good morning',
        'obrigado': 'thank you',
        'por favor': 'please',
        'sim': 'yes',
        'não': 'no'
      },
      'en-es': {
        'hello': 'hola',
        'world': 'mundo',
        'good morning': 'buenos días',
        'thank you': 'gracias',
        'please': 'por favor',
        'yes': 'sí',
        'no': 'no'
      }
    };

    const translationKey = `${sourceLanguage}-${targetLanguage}`;
    const dictionary = translations[translationKey];

    if (dictionary) {
      const lowerText = text.toLowerCase();
      const translated = dictionary[lowerText];
      
      if (translated) {
        return translated;
      }
    }

    // Se não encontrar tradução específica, simular tradução
    return `[${targetLanguage.toUpperCase()}] ${text}`;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async close() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      console.log('🔌 Conexão RabbitMQ fechada');
    } catch (error) {
      console.error('❌ Erro ao fechar conexão:', error);
    }
  }

  // Método para lidar com shutdown graceful
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`\n🛑 Recebido sinal ${signal}. Iniciando shutdown graceful...`);
      
      try {
        await this.close();
        process.exit(0);
      } catch (error) {
        console.error('❌ Erro durante shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }
}

module.exports = QueueConsumer;