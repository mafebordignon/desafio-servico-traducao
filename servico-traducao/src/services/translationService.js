const Translation = require('../models/Translation');
const { sendMessageToQueue } = require('./queueService');
const logger = require('../utils/logger');

// Função para criar uma nova tradução
async function createTranslation(text, targetLanguage) {
  try {
    const translationRequest = {
      text,
      targetLanguage,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Salvar a solicitação de tradução no banco de dados
    const translation = await Translation.create(translationRequest);

    // Enviar a solicitação para a fila RabbitMQ
    const queueName = process.env.TRANSLATION_QUEUE || 'translation_queue';
    await sendMessageToQueue(queueName, {
      id: translation.id,
      text: translation.text,
      targetLanguage: translation.targetLanguage
    });

    logger.info(`📤 Tradução enviada para a fila: ${translation.id}`);
    return translation;
  } catch (error) {
    logger.error('❌ Erro ao criar tradução:', error);
    throw error;
  }
}

// Função para buscar uma tradução pelo ID
async function getTranslationById(id) {
  try {
    const translation = await Translation.findByPk(id);
    if (!translation) {
      throw new Error(`Tradução com ID ${id} não encontrada`);
    }
    return translation;
  } catch (error) {
    logger.error(`❌ Erro ao buscar tradução com ID ${id}:`, error);
    throw error;
  }
}

// Função para listar todas as traduções
async function listTranslations() {
  try {
    const translations = await Translation.findAll();
    return translations;
  } catch (error) {
    logger.error('❌ Erro ao listar traduções:', error);
    throw error;
  }
}

module.exports = {
  createTranslation,
  getTranslationById,
  listTranslations
};