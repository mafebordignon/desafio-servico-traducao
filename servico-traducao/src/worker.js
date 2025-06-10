require('dotenv').config();
const mongoose = require('mongoose');
const QueueConsumer = require('./src/queue/queueConsumer');

class TranslationWorker {
  constructor() {
    this.queueConsumer = new QueueConsumer();
  }

  async start() {
    try {
      console.log('🚀 Iniciando Translation Worker...');

      // Conectar ao MongoDB
      await this.connectToDatabase();

      // Conectar ao RabbitMQ
      await this.queueConsumer.connect();

      // Configurar shutdown graceful
      this.queueConsumer.setupGracefulShutdown();

      // Iniciar consumo de mensagens
      await this.queueConsumer.startConsuming(
        this.queueConsumer.processTranslationMessage.bind(this.queueConsumer)
      );

      console.log('✅ Translation Worker iniciado com sucesso!');
      console.log('📋 Worker aguardando tarefas de tradução...');

    } catch (error) {
      console.error('❌ Erro ao iniciar worker:', error);
      process.exit(1);
    }
  }

  async connectToDatabase() {
    try {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/translation_db';
      
      await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });

      console.log('✅ Conectado ao MongoDB');

    } catch (error) {
      console.error('❌ Erro ao conectar MongoDB:', error);
      throw error;
    }
  }
}

// Verificar se este arquivo está sendo executado diretamente
if (require.main === module) {
  const worker = new TranslationWorker();
  worker.start().catch((error) => {
    console.error('❌ Erro fatal no worker:', error);
    process.exit(1);
  });
}

module.exports = TranslationWorker;