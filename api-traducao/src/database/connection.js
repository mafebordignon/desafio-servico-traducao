const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Tabela de traduções
const createTranslationsTable = `
  CREATE TABLE IF NOT EXISTS translations (
    id SERIAL PRIMARY KEY,
    request_id UUID UNIQUE NOT NULL,
    source_text TEXT NOT NULL,
    source_language VARCHAR(10) NOT NULL,
    target_language VARCHAR(10) NOT NULL,
    translated_text TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`;

// Índices para performance
const createIndexes = `
  CREATE INDEX IF NOT EXISTS idx_translations_request_id ON translations(request_id);
  CREATE INDEX IF NOT EXISTS idx_translations_status ON translations(status);
  CREATE INDEX IF NOT EXISTS idx_translations_created_at ON translations(created_at);
`;

// Trigger para atualizar updated_at automaticamente
const createUpdatedAtTrigger = `
  CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
  END;
  $$ language 'plpgsql';

  DROP TRIGGER IF EXISTS update_translations_updated_at ON translations;
  
  CREATE TRIGGER update_translations_updated_at
    BEFORE UPDATE ON translations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

async function initializeDatabase() {
  try {
    // Testar conexão
    const client = await pool.connect();
    console.log('Database connection established');
    
    // Criar tabelas
    await client.query(createTranslationsTable);
    await client.query(createIndexes);
    await client.query(createUpdatedAtTrigger);
    
    console.log('Database tables created/verified');
    client.release();
    
    return true;
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

// Função para executar queries
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Query error:', { text, error: error.message });
    throw error;
  }
}

// Função para transações
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  transaction,
  initializeDatabase
};