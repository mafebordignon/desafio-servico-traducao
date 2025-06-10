# Sistema de Tradução Assíncrona

Sistema composto por uma API REST e um serviço worker que se comunicam através de filas RabbitMQ para processar traduções de forma assíncrona.

## Arquitetura

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API REST      ├────┤   RabbitMQ      ├────┤  Worker Service │
│ (api-traducao)  │    │    (Queue)      │    │(servico-traducao│
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                                              │
         └──────────────── MongoDB ────────────────────┘
```

## Pré-requisitos

- Node.js 16+ 
- Docker e Docker Compose
- MongoDB
- RabbitMQ

## Configuração Rápida com Docker

1. **Clone o repositório e navegue até a pasta:**
```bash
git clone <repo>
cd DESAFIO-SERVICO-TRADUCAO
```

2. **Inicie os serviços de infraestrutura:**
```bash
docker-compose up -d mongodb rabbitmq
```

3. **Aguarde os serviços iniciarem (cerca de 30 segundos)**

4. **Instale as dependências:**
```bash
# API
cd api-traducao
npm install

# Worker
cd ../servico-traducao  
npm install
```

5. **Inicie os serviços:**
```bash
# Terminal 1 - API
cd api-traducao
npm run dev

# Terminal 2 - Worker  
cd servico-traducao
npm start
```

## Configuração Manual

### 1. MongoDB
```bash
# Via Docker
docker run -d \
  --name translation-mongo \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  mongo:7
```

### 2. RabbitMQ
```bash
# Via Docker
docker run -d \
  --name translation-rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=admin \
  -e RABBITMQ_DEFAULT_PASS=password \
  rabbitmq:3-management
```

### 3. Configurar variáveis de ambiente

**api-traducao/.env:**
```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/translation_db
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

**servico-traducao/.env:**
```env
MONGODB_URI=mongodb://localhost:27017/translation_db
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

## Uso da API

### 1. Criar uma tradução
```bash
curl -X POST http://localhost:3000/api/translations \
  -H "Content-Type: application/json" \
  -d '{
    "text": "hello world",
    "sourceLanguage": "en",
    "targetLanguage": "pt"
  }'
```

**Resposta:**
```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "message": "Tradução enviada para processamento"
}
```

### 2. Verificar status da tradução
```bash
curl http://localhost:3000/api/translations/550e8400-e29b-41d4-a716-446655440000
```

**Resposta (em processamento):**
```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "text": "hello world",
  "sourceLanguage": "en",
  "targetLanguage": "pt",
  "createdAt": "2024-03-15T10:30:00.000Z",
  "updatedAt": "2024-03-15T10:30:05.000Z"
}
```

**Resposta (concluída):**
```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "text": "hello world",
  "translatedText": "olá mundo",
  "sourceLanguage": "en",
  "targetLanguage": "pt",
  "createdAt": "2024-03-15T10:30:00.000Z",
  "updatedAt": "2024-03-15T10:30:10.000Z"
}
```

## Status Possíveis

- **queued**: Requisição na fila, aguardando processamento
- **processing**: Tradução em andamento
- **completed**: Tradução concluída com sucesso
- **failed**: Erro no processamento

## Monitoramento

### RabbitMQ Management
- URL: http://localhost:15672
- Usuário: admin
- Senha: password

### Logs
```bash
# Logs da API
cd api-traducao && npm run dev

# Logs do Worker
cd servico-traducao && npm start
```

## Desenvolvimento

### Scripts disponíveis

**API:**
- `npm start` - Produção
- `npm run dev` - Desenvolvimento com nodemon

**Worker:**
- `npm start` - Produção  
- `npm run dev` - Desenvolvimento com nodemon

### Estrutura do Projeto

```
DESAFIO-SERVICO-TRADUCAO/
├── api-traducao/
│   ├── src/
│   │   ├── database/
│   │   ├── models/
│   │   ├── queue/
│   │   ├── routes/
│   │   └── validators/
│   ├── server.js
│   └── package.json
├── servico-traducao/
│   ├── src/
│   │   └── queue/
│   ├── worker.js
│   └── package.json
├── docker-compose.yml
└── README.md
```

## Troubleshooting

### Worker não processa mensagens
1. Verificar se RabbitMQ está rodando
2. Conferir logs do worker
3. Verificar conectividade MongoDB

### API não responde
1. Verificar se porta 3000 está livre
2. Confirmar conexão MongoDB
3. Verificar logs da aplicação

### Fila não funciona
1. Acessar RabbitMQ Management (localhost:15672)
2. Verificar se fila `translation_queue` existe
3. Conferir credenciais RabbitMQ

### Comandos úteis

```bash
# Ver logs do container
docker logs translation-rabbitmq
docker logs translation-mongo

# Restart dos serviços
docker-compose restart

# Limpar tudo
docker-compose down -v
```