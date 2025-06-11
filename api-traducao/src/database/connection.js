const { Pool } = require('pg');
const logger = require('../utils/logger');

// Configuração da conexão com o banco de dados
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres123@localhost:5432/translation_db'
});

// Função para executar consultas no banco de dados
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      logger.warn(`Consulta lenta: ${duration}ms`, {
        text,
        duration,
        rows: result.rowCount
      });
    }
    
    return result;
  } catch (error) {
    logger.error('Erro ao executar consulta SQL:', error);
    throw error;
  }
}

// Função para obter cliente do pool para transações
async function getClient() {
  const client = await pool.connect();
  const originalQuery = client.query;
  const release = client.release;
  
  // Contabilizar tempo das consultas
  client.query = (...args) => {
    const start = Date.now();
    const result = originalQuery.apply(client, args);
    
    result.then(() => {
      const duration = Date.now() - start;
      if (duration > 1000) {
        logger.warn(`Consulta lenta em transação: ${duration}ms`, {
          query: args[0],
          duration,
        });
      }
    }).catch(err => {
      logger.error('Erro ao executar consulta em transação:', err);
    });
    
    return result;
  };
  
  // Garantir que o cliente será liberado
  client.release = () => {
    client.query = originalQuery;
    release.apply(client);
  };
  
  return client;
}

// Função para encerrar o pool
async function closePool() {
  try {
    await pool.end();
    logger.info('Pool de conexões com o banco de dados encerrado');
  } catch (error) {
    logger.error('Erro ao encerrar pool de conexões:', error);
    throw error;
  }
}

module.exports = {
  query,
  getClient,
  closePool
}; 