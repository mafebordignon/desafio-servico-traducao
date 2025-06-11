-- scripts/init-db.sql
-- Inicialização do banco de dados PostgreSQL para Sistema de Tradução

-- Criar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Criar enum para status das traduções
CREATE TYPE translation_status AS ENUM (
    'pending',
    'processing', 
    'completed',
    'failed',
    'cancelled'
);

-- Criar enum para idiomas suportados
CREATE TYPE language_code AS ENUM (
    'pt',
    'en', 
    'es',
    'fr',
    'de',
    'it',
    'ja',
    'ko',
    'zh'
);

-- Tabela principal de traduções
CREATE TABLE translations (
    id SERIAL PRIMARY KEY,
    request_id UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
    source_text TEXT NOT NULL,
    source_language language_code NOT NULL,
    target_language language_code NOT NULL,
    translated_text TEXT,
    status translation_status NOT NULL DEFAULT 'pending',
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    priority INTEGER DEFAULT 1,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT valid_languages CHECK (source_language != target_language),
    CONSTRAINT valid_retry_count CHECK (retry_count >= 0 AND retry_count <= max_retries),
    CONSTRAINT valid_priority CHECK (priority >= 1 AND priority <= 10),
    CONSTRAINT valid_source_text CHECK (length(trim(source_text)) > 0)
);

-- Tabela de estatísticas de uso
CREATE TABLE translation_stats (
    id SERIAL PRIMARY KEY,
    language_pair VARCHAR(10) NOT NULL, -- e.g., 'en-pt'
    total_translations INTEGER DEFAULT 0,
    successful_translations INTEGER DEFAULT 0,
    failed_translations INTEGER DEFAULT 0,
    avg_processing_time_ms INTEGER DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(language_pair)
);

-- Tabela de logs de auditoria
CREATE TABLE translation_audit_logs (
    id SERIAL PRIMARY KEY,
    translation_id INTEGER REFERENCES translations(id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_status translation_status,
    new_status translation_status,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance
CREATE INDEX idx_translations_request_id ON translations(request_id);
CREATE INDEX idx_translations_status ON translations(status);
CREATE INDEX idx_translations_created_at ON translations(created_at);
CREATE INDEX idx_translations_language_pair ON translations(source_language, target_language);
CREATE INDEX idx_translations_priority_status ON translations(priority DESC, status, created_at);

-- Índices compostos para queries comuns
CREATE INDEX idx_translations_status_created ON translations(status, created_at);
CREATE INDEX idx_translations_lang_status ON translations(source_language, target_language, status);

-- Índices para busca de texto
CREATE INDEX idx_translations_source_text_gin ON translations USING gin(source_text gin_trgm_ops);

-- Índices para auditoria
CREATE INDEX idx_audit_logs_translation_id ON translation_audit_logs(translation_id);
CREATE INDEX idx_audit_logs_request_id ON translation_audit_logs(request_id);
CREATE INDEX idx_audit_logs_created_at ON translation_audit_logs(created_at);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_translations_updated_at 
    BEFORE UPDATE ON translations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger para logs de auditoria
CREATE OR REPLACE FUNCTION log_translation_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Log apenas mudanças de status
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO translation_audit_logs (
            translation_id,
            request_id,
            action,
            old_status,
            new_status,
            details
        ) VALUES (
            NEW.id,
            NEW.request_id,
            'status_change',
            OLD.status,
            NEW.status,
            jsonb_build_object(
                'retry_count', NEW.retry_count,
                'error_message', NEW.error_message,
                'processing_time_ms', 
                CASE 
                    WHEN NEW.completed_at IS NOT NULL AND NEW.started_at IS NOT NULL 
                    THEN EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) * 1000
                    ELSE NULL 
                END
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER audit_translation_changes
    AFTER UPDATE ON translations
    FOR EACH ROW
    EXECUTE FUNCTION log_translation_changes();

-- Trigger para atualizar estatísticas
CREATE OR REPLACE FUNCTION update_translation_stats()
RETURNS TRIGGER AS $$
DECLARE
    lang_pair VARCHAR(10);
    processing_time INTEGER;
BEGIN
    lang_pair := NEW.source_language || '-' || NEW.target_language;
    
    -- Calcular tempo de processamento se disponível
    processing_time := NULL;
    IF NEW.completed_at IS NOT NULL AND NEW.started_at IS NOT NULL THEN
        processing_time := EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) * 1000;
    END IF;
    
    -- Atualizar ou inserir estatísticas
    INSERT INTO translation_stats (
        language_pair,
        total_translations,
        successful_translations,
        failed_translations,
        avg_processing_time_ms
    ) VALUES (
        lang_pair,
        1,
        CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
        CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
        COALESCE(processing_time, 0)
    )
    ON CONFLICT (language_pair) DO UPDATE SET
        total_translations = translation_stats.total_translations + 1,
        successful_translations = translation_stats.successful_translations + 
            CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
        failed_translations = translation_stats.failed_translations + 
            CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
        avg_processing_time_ms = 
            CASE 
                WHEN processing_time IS NOT NULL THEN
                    (translation_stats.avg_processing_time_ms + processing_time) / 2
                ELSE translation_stats.avg_processing_time_ms
            END,
        last_updated = CURRENT_TIMESTAMP;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_translation_statistics
    AFTER UPDATE ON translations
    FOR EACH ROW
    WHEN (NEW.status IN ('completed', 'failed'))
    EXECUTE FUNCTION update_translation_stats();

-- Função para limpeza de registros antigos
CREATE OR REPLACE FUNCTION cleanup_old_translations(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM translations 
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '1 day' * days_to_keep
    AND status IN ('completed', 'failed', 'cancelled');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Limpar logs de auditoria órfãos
    DELETE FROM translation_audit_logs 
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '1 day' * days_to_keep;
    
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Views úteis
CREATE VIEW v_translation_summary AS
SELECT 
    DATE(created_at) as date,
    source_language,
    target_language,
    status,
    COUNT(*) as count,
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_processing_time_seconds
FROM translations
GROUP BY DATE(created_at), source_language, target_language, status
ORDER BY date DESC, count DESC;

CREATE VIEW v_active_translations AS
SELECT 
    request_id,
    source_language,
    target_language,
    status,
    created_at,
    updated_at,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) as age_seconds
FROM translations
WHERE status IN ('pending', 'processing')
ORDER BY priority DESC, created_at ASC;

-- Inserir dados iniciais para estatísticas
INSERT INTO translation_stats (language_pair, total_translations, successful_translations, failed_translations)
VALUES 
    ('en-pt', 0, 0, 0),
    ('pt-en', 0, 0, 0),
    ('en-es', 0, 0, 0),
    ('es-en', 0, 0, 0),
    ('pt-es', 0, 0, 0),
    ('es-pt', 0, 0, 0)
ON CONFLICT (language_pair) DO NOTHING;

-- Criar usuário específico para a aplicação (opcional)
CREATE USER translation_app WITH PASSWORD 'translation_app_pass';
GRANT CONNECT ON DATABASE translation_db TO translation_app;
GRANT USAGE ON SCHEMA public TO translation_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO translation_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO translation_app;

-- Comentários nas tabelas
COMMENT ON TABLE translations IS 'Tabela principal para armazenar solicitações de tradução';
COMMENT ON TABLE translation_stats IS 'Estatísticas agregadas por par de idiomas';
COMMENT ON TABLE translation_audit_logs IS 'Log de auditoria para mudanças nas traduções';

-- Comentários em colunas importantes
COMMENT ON COLUMN translations.request_id IS 'UUID único para identificar a solicitação externamente';
COMMENT ON COLUMN translations.priority IS 'Prioridade da tradução (1-10, maior = mais prioritário)';
COMMENT ON COLUMN translations.metadata IS 'Dados adicionais em formato JSON';

COMMIT;