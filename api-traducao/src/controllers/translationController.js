const { getRabbitMQChannel } = require('../config/rabbitmq');
const logger = require('../utils/logger');

// Função para criar uma nova tradução
async function createTranslation(req, res) {
  try {
    const { text, targetLanguage } = req.body;

    if (!text || !targetLanguage) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Os campos "text" e "targetLanguage" são obrigatórios'
      });
    }

    const channel = getRabbitMQChannel();
    const queueName = process.env.TRANSLATION_QUEUE || 'translation_queue';

    const translationRequest = {
      text,
      targetLanguage,
      timestamp: new Date().toISOString()
    };

    await channel.sendToQueue(queueName, Buffer.from(JSON.stringify(translationRequest)));
    logger.info('📤 Tradução enviada para a fila', translationRequest);

    res.status(202).json({
      message: 'Tradução enviada para processamento',
      request: translationRequest
    });
  } catch (error) {
    logger.error('❌ Erro ao criar tradução:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Erro ao processar a tradução'
    });
  }
}

// Função para listar traduções (exemplo de endpoint para histórico)
async function listTranslations(req, res) {
  try {
    // Aqui você pode implementar lógica para buscar traduções do banco de dados
    const translations = []; // Exemplo: lista vazia
    res.status(200).json({
      message: 'Lista de traduções',
      translations
    });
  } catch (error) {
    logger.error('❌ Erro ao listar traduções:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Erro ao buscar traduções'
    });
  }
}

module.exports = {
  createTranslation,
  listTranslations
};