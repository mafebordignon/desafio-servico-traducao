// Logger simples utilizando console.log
const logger = {
  info: (message, meta = {}) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, Object.keys(meta).length > 0 ? meta : '');
  },
  
  warn: (message, meta = {}) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, Object.keys(meta).length > 0 ? meta : '');
  },
  
  error: (message, meta = {}) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, Object.keys(meta).length > 0 ? meta : '');
  },
  
  debug: (message, meta = {}) => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, Object.keys(meta).length > 0 ? meta : '');
    }
  }
};

// Registrar erros não tratados
process.on('uncaughtException', (err) => {
  logger.error('Erro não tratado:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Rejeição não tratada:', { reason });
});

module.exports = logger;