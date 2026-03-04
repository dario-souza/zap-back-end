# Guia de Desenvolvimento Local

## Pré-requisitos

- Node.js 18+
- Docker (apenas para Redis local)

## Configuração

### 1. Variáveis de Ambiente

Copie o arquivo de exemplo:
```bash
cp .env.local.example .env.local
```

Edite o `.env.local` e adicione sua `SUPABASE_SERVICE_ROLE_KEY` (obtida no dashboard do Supabase).

### 2. Iniciar Redis Local

```bash
# Iniciar Redis
npm run redis:start

# Ver logs
npm run redis:logs

# Parar
npm run redis:stop
```

Ou manualmente:
```bash
docker compose -f docker-compose.local.yml up -d
```

## Executar

### Terminal 1 - API Server
```bash
npm run dev:local
```

### Terminal 2 - Worker (obrigatório para processar mensagens)
```bash
npm run dev:worker
```

Ou em um único terminal:
```bash
npm run dev:all
```

## Front-end

Configure o front-end para usar back-end local:

Edite `zap-reminder/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

Inicie o front-end:
```bash
cd zap-reminder
npm run dev
```

## Limitações

- **Webhooks não funcionam localmente** - O WAHA na nuvem precisa de URL pública para enviar webhooks
- **Confirmações de leitura/entrega** - Não serão recebidas no ambiente local
- **Envio de mensagens** - Funciona normalmente

## Solução Completa (com webhooks)

Se precisar de webhooks, use [ngrok](https://ngrok.com/):

```bash
# Terminal 1 - ngrok
ngrok http 3001

# Copie a URL gerada (ex: https://abc123.ngrok.io)
# Configure no WAHA Dashboard como webhook URL

# Altere .env.local:
WAHA_WEBHOOK_URL=https://sua-url-ngrok.io/api/webhooks/waha
```
