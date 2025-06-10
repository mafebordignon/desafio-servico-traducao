const Joi = require('joi');

// Idiomas suportados (você pode expandir esta lista)
const SUPPORTED_LANGUAGES = [
  'en', 'pt', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'zh', 'ru', 'ar', 'hi', 'tr', 'nl', 'sv', 'da', 'no', 'fi'
];

// Schema para criação de tradução
const createTranslationSchema = Joi.object({
  sourceText: Joi.string()
    .min(1)
    .max(5000)
    .required()
    .messages({
      'string.empty': 'Source text cannot be empty',
      'string.min': 'Source text must be at least 1 character long',
      'string.max': 'Source text cannot exceed 5000 characters',
      'any.required': 'Source text is required'
    }),

  sourceLanguage: Joi.string()
    .valid(...SUPPORTED_LANGUAGES)
    .required()
    .messages({
      'any.only': `Source language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`,
      'any.required': 'Source language is required'
    }),

  targetLanguage: Joi.string()
    .valid(...SUPPORTED_LANGUAGES)
    .required()
    .messages({
      'any.only': `Target language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`,
      'any.required': 'Target language is required'
    })
}).custom((value, helpers) => {
  // Validar que sourceLanguage e targetLanguage são diferentes
  if (value.sourceLanguage === value.targetLanguage) {
    return helpers.error('custom.sameLanguage');
  }
  return value;
}).messages({
  'custom.sameLanguage': 'Source and target languages must be different'
});

// Schema para query parameters de listagem
const listTranslationsSchema = Joi.object({
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(50),

  offset: Joi.number()
    .integer()
    .min(0)
    .default(0),

  status: Joi.string()
    .valid('queued', 'processing', 'completed', 'failed')
    .optional(),

  sortBy: Joi.string()
    .valid('created_at', 'updated_at', 'status')
    .default('created_at'),

  sortOrder: Joi.string()
    .valid('ASC', 'DESC')
    .default('DESC')
});

// Schema para validação de UUID
const uuidSchema = Joi.string()
  .uuid({ version: 'uuidv4' })
  .required()
  .messages({
    'string.guid': 'Request ID must be a valid UUID',
    'any.required': 'Request ID is required'
  });

// Middleware de validação
function validateCreateTranslation(req, res, next) {
  const { error, value } = createTranslationSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    return res.status(400).json({
      error: 'Validation error',
      details: error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }))
    });
  }

  req.validatedData = value;
  next();
}

function validateListTranslations(req, res, next) {
  const { error, value } = listTranslationsSchema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    return res.status(400).json({
      error: 'Validation error',
      details: error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }))
    });
  }

  req.validatedQuery = value;
  next();
}

function validateRequestId(req, res, next) {
  const { error } = uuidSchema.validate(req.params.requestId);

  if (error) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Invalid request ID format'
    });
  }

  next();
}

// Função para validar idiomas
function isValidLanguage(language) {
  return SUPPORTED_LANGUAGES.includes(language);
}

// Função para obter lista de idiomas suportados
function getSupportedLanguages() {
  return SUPPORTED_LANGUAGES;
}

module.exports = {
  validateCreateTranslation,
  validateListTranslations,
  validateRequestId,
  isValidLanguage,
  getSupportedLanguages,
  createTranslationSchema,
  listTranslationsSchema,
  uuidSchema
};