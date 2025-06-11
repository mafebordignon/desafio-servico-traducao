#!/bin/bash

# Exibir mensagens de log
echo "🚀 Iniciando configuração do ambiente..."

# Instalar dependências do projeto
echo "📦 Instalando dependências do projeto..."
npm install

# Verificar se o arquivo .env existe na raiz do projeto
if [ ! -f ../.env ]; then
  echo "⚠️ Arquivo .env não encontrado na raiz do projeto. Certifique-se de criar o arquivo antes de continuar."
  exit 1
fi

# Testar conexão com o banco de dados
echo "🔗 Testando conexão com o banco de dados..."
node -e "require('./src/config/database').testConnection().catch(() => process.exit(1))"
if [ $? -ne 0 ]; then
  echo "❌ Erro ao conectar ao banco de dados. Verifique as configurações no arquivo .env."
  exit 1
fi

# Testar conexão com RabbitMQ
echo "🐰 Testando conexão com RabbitMQ..."
node -e "require('./src/config/rabbitmq').connectRabbitMQ().then(() => require('./src/config/rabbitmq').closeRabbitMQConnection()).catch(() => process.exit(1))"
if [ $? -ne 0 ]; then
  echo "❌ Erro ao conectar ao RabbitMQ. Verifique as configurações no arquivo .env."
  exit 1
fi

# Exibir mensagem de sucesso
echo "✅ Ambiente configurado com sucesso!"