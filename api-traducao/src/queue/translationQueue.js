const { getRabbitMQChannel } = require('../config/rabbitmq');
const logger = require('../utils/logger');

/**
 * Publica um trabalho de tradução na fila
 * @param {Object} translationJob - Dados do trabalho de tradução
 * @returns {Promise<void>}
 */
async function publishTranslationJob(translationJob) {
  try {
    const channel = getRabbitMQChannel();
    const queueName = process.env.TRANSLATION_QUEUE || 'translation_queue';
    
    // Garantir que a fila existe
    await channel.assertQueue(queueName, { durable: true });
    
    // Publicar mensagem
    const success = channel.sendToQueue(
      queueName,
      Buffer.from(JSON.stringify(translationJob)),
      {
        persistent: true,
        contentType: 'application/json',
        messageId: translationJob.requestId,
        timestamp: Date.now(),
        headers: {
          sourceLanguage: translationJob.sourceLanguage,
          targetLanguage: translationJob.targetLanguage
        }
      }
    );
    
    if (success) {
      logger.info(`📤 Trabalho de tradução enviado para fila: ${translationJob.requestId}`);
    } else {
      logger.warn(`⚠️ Não foi possível enviar o trabalho para a fila: ${translationJob.requestId}`);
    }
  } catch (error) {
    logger.error('❌ Erro ao publicar trabalho de tradução:', error);
    throw error;
  }
}

/**
 * Obtém estatísticas da fila
 * @returns {Promise<Object>} Estatísticas da fila
 */
async function getQueueStats() {
  try {
    const channel = getRabbitMQChannel();
    const queueName = process.env.TRANSLATION_QUEUE || 'translation_queue';
    
    const queueInfo = await channel.assertQueue(queueName, { durable: true });
    
    return {
      queueName,
      messageCount: queueInfo.messageCount,
      consumerCount: queueInfo.consumerCount
    };
  } catch (error) {
    logger.error('❌ Erro ao obter estatísticas da fila:', error);
    return {
      queueName: process.env.TRANSLATION_QUEUE || 'translation_queue',
      messageCount: 0,
      consumerCount: 0,
      error: error.message
    };
  }
}

module.exports = {
  publishTranslationJob,
  getQueueStats
}; 