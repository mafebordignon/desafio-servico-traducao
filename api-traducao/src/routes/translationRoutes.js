const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Translation = require('../models/Translation');
const { publishTranslationJob, getQueueStats } = require('../queue/translationQueue');
const {
  validateCreateTranslation,
  validateListTranslations,
  validateRequestId,
  getSupportedLanguages
} = require('../validators/translationValidators');

const router = express.Router();

// POST /translations - Criar nova tradução
router.post('/', validateCreateTranslation, async (req, res) => {
  try {
    const { sourceText, sourceLanguage, targetLanguage } = req.validatedData;
    const requestId = uuidv4();

    // Salvar no banco de dados
    const translation = await Translation.create({
      requestId,
      sourceText,
      sourceLanguage,
      targetLanguage,
      status: 'queued'
    });

    // Publicar na fila RabbitMQ
    await publishTranslationJob({
      requestId,
      sourceText,
      sourceLanguage,
      targetLanguage,
      timestamp: new Date().toISOString()
    });

    console.log(`📝 Translation request created: ${requestId}`);

    res.status(202).json({
      message: 'Translation request received and queued for processing',
      requestId,
      status: 'queued',
      estimatedProcessingTime: '1-5 minutes'
    });

  } catch (error) {
    console.error('Error creating translation:', error);
    
    if (error.code === '23505') { // Unique constraint violation
      return res.status(409).json({
        error: 'Duplicate request',
        message: 'A translation with this request ID already exists'
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create translation request'
    });
  }
});

// GET /translations/:requestId - Buscar status da tradução
router.get('/:requestId', validateRequestId, async (req, res) => {
  try {
    const { requestId } = req.params;
    
    const translation = await Translation.findByRequestId(requestId);
    
    if (!translation) {
      return res.status(404).json({
        error: 'Translation not found',
        message: 'No translation found with the provided request ID'
      });
    }

    // Resposta baseada no status
    const response = {
      requestId: translation.requestId,
      status: translation.status,
      sourceLanguage: translation.sourceLanguage,
      targetLanguage: translation.targetLanguage,
      createdAt: translation.createdAt,
      updatedAt: translation.updatedAt
    };

    // Adicionar dados específicos baseados no status
    switch (translation.status) {
      case 'queued':
        response.message = 'Translation is queued and waiting to be processed';
        break;
        
      case 'processing':
        response.message = 'Translation is currently being processed';
        break;
        
      case 'completed':
        response.message = 'Translation completed successfully';
        response.sourceText = translation.sourceText;
        response.translatedText = translation.translatedText;
        break;
        
      case 'failed':
        response.message = 'Translation failed';
        response.error = translation.errorMessage || 'Unknown error occurred';
        break;
    }

    res.json(response);

  } catch (error) {
    console.error('Error fetching translation:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch translation status'
    });
  }
});

// GET /translations - Listar traduções (com paginação e filtros)
router.get('/', validateListTranslations, async (req, res) => {
  try {
    const options = req.validatedQuery;
    
    const result = await Translation.list(options);
    
    res.json({
      translations: result.translations,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore
      }
    });

  } catch (error) {
    console.error('Error listing translations:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch translations'
    });
  }
});

// GET /translations/stats/summary - Estatísticas das traduções
router.get('/stats/summary', async (req, res) => {
  try {
    const [dbStats, queueStats] = await Promise.all([
      Translation.getStats(),
      getQueueStats()
    ]);

    res.json({
      database: dbStats,
      queue: queueStats || { messageCount: 0, consumerCount: 0 },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch statistics'
    });
  }
});

// GET /translations/languages/supported - Idiomas suportados
router.get('/languages/supported', (req, res) => {
  const languages = getSupportedLanguages();
  
  // Mapeamento de códigos para nomes (você pode expandir isso)
  const languageMap = {
    'en': 'English',
    'pt': 'Portuguese',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'ru': 'Russian',
    'ar': 'Arabic',
    'hi': 'Hindi',
    'tr': 'Turkish',
    'nl': 'Dutch',
    'sv': 'Swedish',
    'da': 'Danish',
    'no': 'Norwegian',
    'fi': 'Finnish'
  };

  const supportedLanguages = languages.map(code => ({
    code,
    name: languageMap[code] || code.toUpperCase()
  }));

  res.json({
    supportedLanguages,
    total: supportedLanguages.length
  });
});

// DELETE /translations/:requestId - Cancelar tradução (apenas se ainda não processada)
router.delete('/:requestId', validateRequestId, async (req, res) => {
  try {
    const { requestId } = req.params;
    
    const translation = await Translation.findByRequestId(requestId);
    
    if (!translation) {
      return res.status(404).json({
        error: 'Translation not found',
        message: 'No translation found with the provided request ID'
      });
    }

    // Só permite cancelar se ainda não foi processada
    if (translation.status === 'processing' || translation.status === 'completed') {
      return res.status(400).json({
        error: 'Cannot cancel translation',
        message: `Translation is already ${translation.status} and cannot be cancelled`
      });
    }

    if (translation.status === 'failed') {
      return res.status(400).json({
        error: 'Translation already failed',
        message: 'This translation has already failed'
      });
    }

    // Marcar como cancelada (você pode adicionar este status ao enum)
    await Translation.updateStatus(requestId, 'failed', {
      errorMessage: 'Translation cancelled by user'
    });

    res.json({
      message: 'Translation cancelled successfully',
      requestId,
      status: 'cancelled'
    });

  } catch (error) {
    console.error('Error cancelling translation:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to cancel translation'
    });
  }
});

module.exports = router;