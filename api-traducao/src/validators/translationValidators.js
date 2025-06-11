const { body, param, query, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Lista de idiomas suportados
const SUPPORTED_LANGUAGES = [
  'en', 'pt', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'zh', 'ru', 'ar', 'hi', 'tr', 'nl', 'sv', 'da', 'no', 'fi'
];

// Função para obter idiomas suportados
const getSupportedLanguages = () => SUPPORTED_LANGUAGES;

// Validador para criar tradução
const validateCreateTranslation = [
  body('sourceText')
    .notEmpty().withMessage('O texto de origem é obrigatório')
    .isString().withMessage('O texto de origem deve ser uma string')
    .isLength({ min: 1, max: 5000 }).withMessage('O texto de origem deve ter entre 1 e 5000 caracteres'),
  
  body('sourceLanguage')
    .notEmpty().withMessage('O idioma de origem é obrigatório')
    .isString().withMessage('O idioma de origem deve ser uma string')
    .isIn(SUPPORTED_LANGUAGES).withMessage(`O idioma de origem deve ser um dos seguintes: ${SUPPORTED_LANGUAGES.join(', ')}`),
  
  body('targetLanguage')
    .notEmpty().withMessage('O idioma de destino é obrigatório')
    .isString().withMessage('O idioma de destino deve ser uma string')
    .isIn(SUPPORTED_LANGUAGES).withMessage(`O idioma de destino deve ser um dos seguintes: ${SUPPORTED_LANGUAGES.join(', ')}`)
    .custom((value, { req }) => {
      if (value === req.body.sourceLanguage) {
        throw new Error('O idioma de destino não pode ser igual ao idioma de origem');
      }
      return true;
    }),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Erro de validação na criação de tradução:', errors.array());
      return res.status(400).json({
        error: 'Validation Error',
        details: errors.array()
      });
    }
    
    // Adicionar dados validados ao req
    req.validatedData = {
      sourceText: req.body.sourceText,
      sourceLanguage: req.body.sourceLanguage,
      targetLanguage: req.body.targetLanguage
    };
    
    next();
  }
];

// Validador para buscar tradução por requestId
const validateRequestId = [
  param('requestId')
    .notEmpty().withMessage('O ID da requisição é obrigatório')
    .isUUID().withMessage('O ID da requisição deve ser um UUID válido'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Erro de validação no ID da requisição:', errors.array());
      return res.status(400).json({
        error: 'Validation Error',
        details: errors.array()
      });
    }
    next();
  }
];

// Validador para listar traduções
const validateListTranslations = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('O limite deve ser um número entre 1 e 100')
    .toInt(),
  
  query('offset')
    .optional()
    .isInt({ min: 0 }).withMessage('O offset deve ser um número maior ou igual a 0')
    .toInt(),
  
  query('status')
    .optional()
    .isIn(['queued', 'processing', 'completed', 'failed']).withMessage('Status inválido'),
  
  query('sortBy')
    .optional()
    .isIn(['created_at', 'updated_at', 'status']).withMessage('Campo de ordenação inválido'),
  
  query('sortOrder')
    .optional()
    .isIn(['ASC', 'DESC']).withMessage('Ordem de classificação inválida'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Erro de validação na listagem de traduções:', errors.array());
      return res.status(400).json({
        error: 'Validation Error',
        details: errors.array()
      });
    }
    
    // Adicionar parâmetros validados ao req
    req.validatedQuery = {
      limit: req.query.limit || 50,
      offset: req.query.offset || 0,
      status: req.query.status,
      sortBy: req.query.sortBy || 'created_at',
      sortOrder: req.query.sortOrder || 'DESC'
    };
    
    next();
  }
];

module.exports = {
  validateCreateTranslation,
  validateRequestId,
  validateListTranslations,
  getSupportedLanguages
}; 