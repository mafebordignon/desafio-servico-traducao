const amqp = require('amqplib');

let connection;
let channel;

const QUEUE_NAME = 'translation_queue';
const EXCHANGE_NAME = 'translation_exchange';
const ROUTING_KEY = 'translation.process';

async function initializeQueue() {
  try {
    // Conectar ao RabbitMQ
    const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://admin:admin123@rabbitmq:5672';
    console.log('Connecting to RabbitMQ...');
    
    connection = await amqp.connect(rabbitmqUrl);
    console.log('✅ RabbitMQ connection established');

    // Criar canal
    channel = await connection.createChannel();
    console.log('✅ RabbitMQ channel created');

    // Declarar exchange
    await channel.assertExchange(EXCHANGE_NAME, 'direct', {
      durable: true
    });

    // Declarar fila
    await channel.assertQueue(QUEUE_NAME, {
      durable: true,
      arguments: {
        'x-message-ttl': 24 * 60 * 60 * 1000, // TTL de 24 horas
        'x-max-retries': 3
      }
    });

    // Bind da fila ao exchange
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_KEY);

    // Configurar prefetch para controlar quantas mensagens não confirmadas um worker pode processar
    await channel.prefetch(1);

    console.log('✅ RabbitMQ queue and exchange configured');

    // Event handlers para conexão
    connection.on('error', (err) => {
      console.error('RabbitMQ connection error:', err);
    });

    connection.on('close', () => {
      console.log('RabbitMQ connection closed');
    });

    return { connection, channel };
  } catch (error) {
    console.error('❌ RabbitMQ initialization error:', error);
    throw error;
  }
}

async function publishTranslationJob(jobData) {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized');
  }

  try {
    const message = JSON.stringify({
      ...jobData,
      timestamp: new Date().toISOString(),
      attempts: 0,
      maxAttempts: 3
    });

    const published = channel.publish(
      EXCHANGE_NAME,
      ROUTING_KEY,
      Buffer.from(message),
      {
        persistent: true, // Mensagem persistente
        messageId: jobData.requestId,
        timestamp: Date.now(),
        headers: {
          'x-retry-count': 0
        }
      }
    );

    if (published) {
      console.log(`✅ Translation job published for request: ${jobData.requestId}`);
      return true;
    } else {
      throw new Error('Failed to publish message to queue');
    }
  } catch (error) {
    console.error('❌ Error publishing translation job:', error);
    throw error;
  }
}

async function consumeTranslationJobs(processingCallback) {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized');
  }

  try {
    console.log('🔄 Starting to consume translation jobs...');

    await channel.consume(QUEUE_NAME, async (message) => {
      if (!message) {
        return;
      }

      let jobData;
      try {
        jobData = JSON.parse(message.content.toString());
        console.log(`📨 Received translation job: ${jobData.requestId}`);

        // Processar a mensagem
        await processingCallback(jobData, message);

        // Confirmar processamento (ACK)
        channel.ack(message);
        console.log(`✅ Job processed successfully: ${jobData.requestId}`);

      } catch (error) {
        console.error(`❌ Error processing job:`, error);

        // Verificar número de tentativas
        const retryCount = message.properties.headers['x-retry-count'] || 0;
        const maxRetries = jobData?.maxAttempts || 3;

        if (retryCount < maxRetries) {
          // Rejeitar e reenviar para a fila
          console.log(`🔄 Retrying job (attempt ${retryCount + 1}/${maxRetries}): ${jobData?.requestId}`);
          
          // Atualizar contador de tentativas
          const retryMessage = {
            ...jobData,
            attempts: retryCount + 1
          };

          await channel.publish(
            EXCHANGE_NAME,
            ROUTING_KEY,
            Buffer.from(JSON.stringify(retryMessage)),
            {
              persistent: true,
              messageId: jobData?.requestId,
              timestamp: Date.now(),
              headers: {
                'x-retry-count': retryCount + 1
              }
            }
          );

          channel.ack(message); // Remove a mensagem original
        } else {
          // Máximo de tentativas atingido, mover para DLQ ou marcar como falha
          console.error(`💀 Job failed after ${maxRetries} attempts: ${jobData?.requestId}`);
          
          // Aqui você pode implementar Dead Letter Queue ou apenas marcar como falha
          if (processingCallback.onMaxRetriesReached) {
            await processingCallback.onMaxRetriesReached(jobData, error);
          }

          channel.ack(message); // Remove a mensagem da fila
        }
      }
    }, {
      noAck: false // Requer confirmação manual
    });

    console.log('✅ Consumer started successfully');
  } catch (error) {
    console.error('❌ Error setting up consumer:', error);
    throw error;
  }
}

async function getQueueStats() {
  if (!channel) {
    return null;
  }

  try {
    const queueInfo = await channel.checkQueue(QUEUE_NAME);
    
    return {
      messageCount: queueInfo.messageCount,
      consumerCount: queueInfo.consumerCount,
      queueName: QUEUE_NAME
    };
  } catch (error) {
    console.error('Error getting queue stats:', error);
    return null;
  }
}

async function purgeQueue() {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized');
  }

  try {
    const result = await channel.purgeQueue(QUEUE_NAME);
    console.log(`Queue purged. Removed ${result.messageCount} messages`);
    return result;
  } catch (error) {
    console.error('Error purging queue:', error);
    throw error;
  }
}

async function closeQueue() {
  try {
    if (channel) {
      await channel.close();
      console.log('RabbitMQ channel closed');
    }
    if (connection) {
      await connection.close();
      console.log('RabbitMQ connection closed');
    }
  } catch (error) {
    console.error('Error closing RabbitMQ:', error);
  }
}

// Função para verificar se a conexão está ativa
function isConnected() {
  return connection && !connection.connection.destroyed && channel;
}

// Função para reconectar em caso de falha
async function reconnect() {
  console.log('🔄 Attempting to reconnect to RabbitMQ...');
  try {
    await closeQueue();
    await initializeQueue();
    console.log('✅ Reconnected to RabbitMQ successfully');
  } catch (error) {
    console.error('❌ Reconnection failed:', error);
    throw error;
  }
}

module.exports = {
  initializeQueue,
  publishTranslationJob,
  consumeTranslationJobs,
  getQueueStats,
  purgeQueue,
  closeQueue,
  isConnected,
  reconnect,
  getConnection: () => connection,
  getChannel: () => channel,
  QUEUE_NAME,
  EXCHANGE_NAME,
  ROUTING_KEY
};