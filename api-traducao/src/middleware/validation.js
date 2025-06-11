const { body, validationResult } = require('express-validator');

// Middleware para validar os dados de entrada
const validateTranslationRequest = [
  body('text')
    .notEmpty()
    .withMessage('O campo "text" é obrigatório')
    .isString()
    .withMessage('O campo "text" deve ser uma string'),
  body('targetLanguage')
    .notEmpty()
    .withMessage('O campo "targetLanguage" é obrigatório')
    .isString()
    .withMessage('O campo "targetLanguage" deve ser uma string'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Erro de validação nos dados de entrada',
        details: errors.array(),
        requestId: req.requestId,
        timestamp: new Date().toISOString()
      });
    }
    next();
  }
];

module.exports = {
  validateTranslationRequest
};