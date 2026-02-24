/**
 * Script para testar o webhook do WAHA com dados reais
 */

const BACKEND_URL = 'https://zap-back-end-production.up.railway.app';

// Session name correto do usuário
const SESSION_NAME = 'user_699db7c3b0ce9807b5ff7cfb';
// Telefone real do usuário
const PHONE = '5511982847519';

const testPayloads = {
  positive: {
    event: 'message',
    session: SESSION_NAME,
    payload: {
      id: 'real_msg_001',
      from: `${PHONE}@c.us`,
      fromMe: false,
      body: 'sim',
      timestamp: Math.floor(Date.now() / 1000),
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
      console.log('✅ Webhook enviado com sucesso!');
    }
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

async function runTests() {
  console.log('\n🚀 Testando webhook com dados reais...\n');
  console.log(`📌 Session: ${SESSION_NAME}`);
  console.log(`📌 Telefone: ${PHONE}`);

  await testWebhook(testPayloads.positive, 'Resposta positiva (sim) - dados reais');

  console.log('\n✅ Teste concluído! Verifique os logs do servidor.');
}

runTests();
