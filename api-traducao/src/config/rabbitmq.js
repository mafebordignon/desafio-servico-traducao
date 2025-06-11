/**
 * Simulação simplificada de conexão com RabbitMQ
 */

const amqp = require('amqplib');
const logger = require('../utils/logger');

let connection = null;
let channel = null;

// Função para conectar ao RabbitMQ
async function connectRabbitMQ() {
  try {
    const rabbitMQUrl = process.env.RABBITMQ_URL || 'amqp://localhost';
    logger.info(`🐰 Conectando ao RabbitMQ em ${rabbitMQUrl}...`);
    
    connection = await amqp.connect(rabbitMQUrl);
    channel = await connection.createChannel();
    
    logger.info('✅ Conexão com RabbitMQ estabelecida');
  } catch (error) {
    logger.error('❌ Erro ao conectar ao RabbitMQ:', error);
    throw error;
  }
}

// Função para testar a conexão com RabbitMQ
async function testRabbitMQConnection() {
  try {
    if (!channel) {
      throw new Error('Canal RabbitMQ não está inicializado');
    }
    await channel.assertQueue('test_queue', { durable: false });
    logger.info('✅ Conexão com RabbitMQ testada com sucesso');
  } catch (error) {
    logger.error('❌ Erro ao testar conexão com RabbitMQ:', error);
    throw error;
  }
}

// Função para obter o canal RabbitMQ
function getRabbitMQChannel() {
  if (!channel) {
    throw new Error('Canal RabbitMQ não está inicializado. Conecte-se primeiro!');
  }
  return channel;
}

// Função para fechar a conexão com RabbitMQ
async function closeRabbitMQConnection() {
  try {
    if (channel) {
      await channel.close();
      logger.info('✅ Canal RabbitMQ fechado');
    }
    if (connection) {
      await connection.close();
      logger.info('✅ Conexão RabbitMQ encerrada');
    }
  } catch (error) {
    logger.error('❌ Erro ao fechar conexão com RabbitMQ:', error);
    throw error;
  }
}

module.exports = {
  connectRabbitMQ,
  testRabbitMQConnection,
  getRabbitMQChannel,
  closeRabbitMQConnection
};