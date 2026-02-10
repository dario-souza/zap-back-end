## 🔗 Integração WhatsApp - Evolution API

### O que é a Evolution API?
A **Evolution API** é uma API gratuita e open source para automação do WhatsApp. Ela permite enviar mensagens via API REST.

### ⚠️ IMPORTANTE: Pré-requisito
A Evolution API precisa ser **instalada separadamente** (não é um serviço pronto). Você tem 3 opções:

#### Opção 1: Instalar Local (Docker)
```bash
# 1. Instale Docker Desktop: https://www.docker.com/products/docker-desktop

# 2. Crie um arquivo docker-compose.yml:
```

```yaml
version: '3.8'
services:
  evolution:
    image: atendai/evolution-api:latest
    ports:
      - "8080:8080"
    environment:
      - SERVER_URL=http://localhost:8080
      - AUTHENTICATION_API_KEY=sua-chave-secreta-aqui
      - AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true
    volumes:
      - evolution_data:/evolution/store

volumes:
  evolution_data:
```

```bash
# 3. Rode:
docker-compose up -d

# 4. Acesse: http://localhost:8080/manager
```

#### Opção 2: Hospedar na Nuvem (Recomendado para produção)
- **Railway**: https://railway.app (tem plano gratuito)
- **Render**: https://render.com (tem plano gratuito)
- **VPS** (DigitalOcean, AWS, etc.)

#### Opção 3: Usar serviço já hospedado (Pago)
Algumas empresas oferecem Evolution API já hospedada por ~R$ 30-50/mês.

### 🚀 Configuração no Projeto

1. Após instalar a Evolution API, configure as variáveis no `.env`:

```env
# Evolution API Configuration
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=sua-chave-secreta-aqui
EVOLUTION_INSTANCE_NAME=zapreminder
```

2. Acesse o Manager da Evolution (http://localhost:8080/manager)
3. Crie uma instância com o nome configurado
4. Escaneie o QR Code com seu WhatsApp
5. Pronto! Suas mensagens serão enviadas automaticamente

### 📱 Fluxo de Funcionamento

```
Usuário agenda mensagem → Backend salva no MongoDB 
   ↓
Horário do agendamento → Backend chama Evolution API
   ↓
Evolution API → Envia para WhatsApp do celular conectado
```

### 📝 Exemplo de uso

Depois de configurado, quando você clicar "Enviar" em uma mensagem:

1. O backend faz POST para Evolution API
2. Evolution envia mensagem via WhatsApp Web
3. Você recebe no celular do destinatário!

### 🔒 Segurança
- Nunca commit suas credenciais
- Use variáveis de ambiente
- Restrinja acesso à Evolution API (firewall)
- Em produção, use HTTPS

### 📚 Documentação oficial
- https://doc.evolution-api.com/
- https://github.com/EvolutionAPI/evolution-api
