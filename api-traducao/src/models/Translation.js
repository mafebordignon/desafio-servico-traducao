const { query } = require('../database/connection');

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

  // Criar nova tradução
  static async create(translationData) {
    const {
      requestId,
      sourceText,
      sourceLanguage,
      targetLanguage,
      status = 'queued'
    } = translationData;

    const queryText = `
      INSERT INTO translations (request_id, source_text, source_language, target_language, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [requestId, sourceText, sourceLanguage, targetLanguage, status];

    try {
      const result = await query(queryText, values);
      return new Translation(result.rows[0]);
    } catch (error) {
      console.error('Error creating translation:', error);
      throw error;
    }
  }

  // Buscar tradução por requestId
  static async findByRequestId(requestId) {
    const queryText = 'SELECT * FROM translations WHERE request_id = $1';
    
    try {
      const result = await query(queryText, [requestId]);
      return result.rows.length > 0 ? new Translation(result.rows[0]) : null;
    } catch (error) {
      console.error('Error finding translation by requestId:', error);
      throw error;
    }
  }

  // Buscar tradução por ID
  static async findById(id) {
    const queryText = 'SELECT * FROM translations WHERE id = $1';
    
    try {
      const result = await query(queryText, [id]);
      return result.rows.length > 0 ? new Translation(result.rows[0]) : null;
    } catch (error) {
      console.error('Error finding translation by id:', error);
      throw error;
    }
  }

  // Atualizar status da tradução
  static async updateStatus(requestId, status, additionalData = {}) {
    let queryText = 'UPDATE translations SET status = $1, updated_at = CURRENT_TIMESTAMP';
    let values = [status, requestId];
    let paramCount = 2;

    // Adicionar campos opcionais
    if (additionalData.translatedText !== undefined) {
      paramCount++;
      queryText += `, translated_text = $${paramCount}`;
      values.splice(-1, 0, additionalData.translatedText);
    }

    if (additionalData.errorMessage !== undefined) {
      paramCount++;
      queryText += `, error_message = $${paramCount}`;
      values.splice(-1, 0, additionalData.errorMessage);
    }

    queryText += ` WHERE request_id = $${paramCount + 1} RETURNING *`;

    try {
      const result = await query(queryText, values);
      return result.rows.length > 0 ? new Translation(result.rows[0]) : null;
    } catch (error) {
      console.error('Error updating translation status:', error);
      throw error;
    }
  }

  // Listar traduções com paginação
  static async list(options = {}) {
    const {
      limit = 50,
      offset = 0,
      status,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = options;

    let queryText = 'SELECT * FROM translations';
    let countQuery = 'SELECT COUNT(*) FROM translations';
    let values = [];
    let whereClause = '';

    // Filtrar por status se fornecido
    if (status) {
      whereClause = ' WHERE status = $1';
      values.push(status);
    }

    queryText += whereClause;
    countQuery += whereClause;

    // Ordenação e paginação
    queryText += ` ORDER BY ${sortBy} ${sortOrder} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    values.push(limit, offset);

    try {
      const [dataResult, countResult] = await Promise.all([
        query(queryText, values),
        query(countQuery, values.slice(0, -2)) // Remove limit e offset do count
      ]);

      const translations = dataResult.rows.map(row => new Translation(row));
      const total = parseInt(countResult.rows[0].count);

      return {
        translations,
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      };
    } catch (error) {
      console.error('Error listing translations:', error);
      throw error;
    }
  }

  // Estatísticas das traduções
  static async getStats() {
    const queryText = `
      SELECT 
        status,
        COUNT(*) as count
      FROM translations 
      GROUP BY status
    `;

    try {
      const result = await query(queryText);
      
      const stats = {
        queued: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        total: 0
      };

      result.rows.forEach(row => {
        stats[row.status] = parseInt(row.count);
        stats.total += parseInt(row.count);
      });

      return stats;
    } catch (error) {
      console.error('Error getting translation stats:', error);
      throw error;
    }
  }

  // Serializar para JSON (remover dados sensíveis se necessário)
  toJSON() {
    return {
      id: this.id,
      requestId: this.requestId,
      sourceText: this.sourceText,
      sourceLanguage: this.sourceLanguage,
      targetLanguage: this.targetLanguage,
      translatedText: this.translatedText,
      status: this.status,
      errorMessage: this.errorMessage,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = Translation;