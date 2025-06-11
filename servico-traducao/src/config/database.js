const { Pool } = require('pg');
const logger = require('../utils/logger');

// Configuração da conexão com o banco de dados
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'translation_db',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT) || 5432,
  max: parseInt(process.env.DB_MAX_CONNECTIONS) || 10, // Número máximo de conexões
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS) || 30000, // Tempo de inatividade
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS) || 2000 // Tempo limite de conexão
});

// Função para testar a conexão com o banco de dados
async function testConnection() {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1'); // Teste simples de consulta
    client.release();
    logger.info('✅ Conexão com o banco de dados testada com sucesso');
  } catch (error) {
    logger.error('❌ Erro ao testar conexão com o banco de dados:', error);
    throw error;
  }
}

// Função para obter o pool de conexões
function connectDatabase() {
  return pool;
}

module.exports = {
  connectDatabase,
  testConnection
};