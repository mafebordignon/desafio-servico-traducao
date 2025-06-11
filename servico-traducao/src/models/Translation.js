const { Pool } = require('pg');
const logger = require('../utils/logger');

// Configuração do pool de conexão
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres123@localhost:5432/translation_db'
});

class Translation {
  constructor(data) {
    this.id = data.id;
    this.requestId = data.request_id;
    this.sourceText = data.source_text;
    this.sourceLanguage = data.source_language;
    this.targetLanguage = data.target_language;
    this.translatedText = data.translated_text;
    this.status = data.status;
    this.errorMessage = data.error_message;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  // Função para encontrar uma tradução por requestId
  static async findByRequestId(requestId) {
    try {
      const query = 'SELECT * FROM translations WHERE request_id = $1';
      const result = await pool.query(query, [requestId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return new Translation(result.rows[0]);
    } catch (error) {
      logger.error(`❌ Erro ao buscar tradução por requestId ${requestId}:`, error);
      throw error;
    }
  }

  // Função para atualizar o status de uma tradução
  static async updateStatus(requestId, status, data = {}) {
    try {
      let query = 'UPDATE translations SET status = $1, updated_at = NOW()';
      const params = [status];
      
      if (data.translatedText) {
        query += ', translated_text = $' + (params.length + 1);
        params.push(data.translatedText);
      }
      
      if (data.errorMessage) {
        query += ', error_message = $' + (params.length + 1);
        params.push(data.errorMessage);
      }
      
      query += ' WHERE request_id = $' + (params.length + 1) + ' RETURNING *';
      params.push(requestId);
      
      const result = await pool.query(query, params);
      
      if (result.rows.length === 0) {
        logger.warn(`⚠️ Nenhuma tradução encontrada para atualizar com o requestId ${requestId}`);
        return null;
      }
      
      logger.info(`✅ Tradução ${requestId} atualizada para status: ${status}`);
      return new Translation(result.rows[0]);
    } catch (error) {
      logger.error(`❌ Erro ao atualizar status da tradução ${requestId}:`, error);
      throw error;
    }
  }

  // Função para criar uma tradução
  static async create(translationData) {
    try {
      const { requestId, sourceText, sourceLanguage, targetLanguage, status = 'pending' } = translationData;
      
      const query = `
        INSERT INTO translations (request_id, source_text, source_language, target_language, status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      
      const params = [requestId, sourceText, sourceLanguage, targetLanguage, status];
      const result = await pool.query(query, params);
      
      logger.info(`✅ Nova tradução criada com requestId: ${requestId}`);
      return new Translation(result.rows[0]);
    } catch (error) {
      logger.error('❌ Erro ao criar tradução:', error);
      throw error;
    }
  }
}

module.exports = Translation;