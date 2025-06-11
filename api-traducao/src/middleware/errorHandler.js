/**
 * Middleware para tratamento centralizado de erros
 */
function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${new Date().toISOString()} - Erro não tratado:`, {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId: req.requestId
  });

  // Determinar código de status
  let statusCode = err.statusCode || 500;
  let errorMessage = err.message || 'Um erro inesperado ocorreu';
  let errorDetails = undefined;

  // Tratar diferentes tipos de erros
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorDetails = err.errors;
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403;
  } else if (err.name === 'NotFoundError') {
    statusCode = 404;
  } else if (err.code === '23505') { // Postgres unique violation
    statusCode = 409;
    errorMessage = 'Recurso já existente';
  }

  // Construir resposta
  const errorResponse = {
    error: true,
    message: errorMessage,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    requestId: req.requestId
  };

  // Adicionar detalhes se existirem
  if (errorDetails) {
    errorResponse.details = errorDetails;
  }

  // Adicionar stack trace em ambiente de desenvolvimento
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = err.stack;
  }

  // Enviar resposta
  res.status(statusCode).json(errorResponse);
}

module.exports = errorHandler;