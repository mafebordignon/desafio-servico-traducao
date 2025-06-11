const { getRabbitMQChannel } = require('../config/rabbitmq');
const logger = require('../utils/logger');

// Função para enviar uma mensagem para uma fila
async function sendMessageToQueue(queueName, message) {
  try {
    const channel = getRabbitMQChannel();
    await channel.assertQueue(queueName, { durable: true });
    channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), { persistent: true });
    logger.info(`📤 Mensagem enviada para a fila "${queueName}"`, message);
  } catch (error) {
    logger.error(`❌ Erro ao enviar mensagem para a fila "${queueName}":`, error);
    throw error;
  }
}

// Função para consumir mensagens de uma fila
async function consumeQueue(queueName, onMessageCallback) {
  try {
    const channel = getRabbitMQChannel();
    await channel.assertQueue(queueName, { durable: true });
    logger.info(`🔄 Consumindo mensagens da fila "${queueName}"`);
    channel.consume(queueName, (msg) => {
      if (msg !== null) {
        const messageContent = JSON.parse(msg.content.toString());
        logger.info(`📥 Mensagem recebida da fila "${queueName}"`, messageContent);
        onMessageCallback(messageContent);
        channel.ack(msg); // Confirmação de processamento
      }
    });
  } catch (error) {
    logger.error(`❌ Erro ao consumir mensagens da fila "${queueName}":`, error);
    throw error;
  }
}

module.exports = {
  sendMessageToQueue,
  consumeQueue
};