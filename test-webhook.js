/**
 * Script para testar o webhook do WAHA
 * Uso: node test-webhook.js
 * 
 * Antes de rodar, configure a URL do seu backend:
 * - Edite a variável BACKEND_URL abaixo
 * - Ou passe via linha de comando: node test-webhook.js https://sua-url.railway.app
 */

const BACKEND_URL = process.argv[2] || 'SUA_URL_AQUI'; // Substitua pela URL do seu backend

// Payload de teste - simulando uma mensagem recebida do WhatsApp
const testPayloads = {
  // Teste 1: Mensagem com resposta positiva "sim"
  positive: {
    event: 'message',
    session: 'user_test-user-id', // Substitua pelo session name correto
    payload: {
      id: 'test_msg_001',
      from: '5511999999999@c.us',
      fromMe: false,
      body: 'sim',
      timestamp: Math.floor(Date.now() / 1000),
    },
  },

  // Teste 2: Mensagem com resposta negativa "não"
  negative: {
    event: 'message',
    session: 'user_test-user-id',
    payload: {
      id: 'test_msg_002',
      from: '5511999999999@c.us',
      fromMe: false,
      body: 'não',
      timestamp: Math.floor(Date.now() / 1000),
    },
  },

  // Teste 3: Mensagem qualquer (sem resposta de confirmação)
  neutral: {
    event: 'message',
    session: 'user_test-user-id',
    payload: {
      id: 'test_msg_003',
      from: '5511999999999@c.us',
      fromMe: false,
      body: 'Olá, tudo bem?',
      timestamp: Math.floor(Date.now() / 1000),
    },
  },

  // Teste 4: Status da sessão
  sessionStatus: {
    event: 'session.status',
    session: 'user_test-user-id',
    payload: {
      status: 'WORKING',
      me: {
        id: '5511888888888@c.us',
        pushName: 'Test User',
      },
    },
  },
};

async function testWebhook(payload, description) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🧪 Teste: ${description}`);
  console.log('='.repeat(50));
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(`${BACKEND_URL}/api/webhooks/waha`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.text();
    console.log(`\n📡 Status: ${response.status}`);
    console.log(`📄 Resposta: ${result}`);
    
    if (response.ok) {
      console.log('✅Webhook enviado com sucesso!');
    } else {
      console.log('❌ Erro ao enviar webhook');
    }
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

async function runTests() {
  console.log('\n🚀 Iniciando testes de webhook...\n');
  console.log(`📌 Backend URL: ${BACKEND_URL}`);

  // Verifica se a URL foi configurada
  if (BACKEND_URL === 'SUA_URL_AQUI') {
    console.error('\n❌ ERRO: Configure a URL do backend!');
    console.log('   Uso: node test-webhook.js https://sua-url.railway.app');
    process.exit(1);
  }

  // Executa todos os testes
  await testWebhook(testPayloads.positive, 'Resposta positiva (sim)');
  await testWebhook(testPayloads.negative, 'Resposta negativa (não)');
  await testWebhook(testPayloads.neutral, 'Mensagem neutra (não deve alterar status)');
  await testWebhook(testPayloads.sessionStatus, 'Status da sessão');

  console.log('\n✅ Todos os testes concluídos!');
  console.log('\n📝 Verifique os logs do servidor para ver se os webhooks foram processados.');
}

runTests();
