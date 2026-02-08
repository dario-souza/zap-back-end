import { prisma } from './src/lib/prisma.ts';

async function testDatabase() {
  try {
    console.log('🔍 Testando conexão com MongoDB...\n');

    // Testar conexão
    await prisma.$connect();
    console.log('✅ Conexão estabelecida com sucesso!\n');

    // Criar um usuário de teste
    console.log('📝 Criando usuário de teste...');
    const user = await prisma.user.create({
      data: {
        name: 'Usuário Teste',
        email: 'teste@exemplo.com',
        password: 'senha123',
        phone: '11999999999',
      },
    });
    console.log('✅ Usuário criado:', user.id);

    // Criar um contato
    console.log('📝 Criando contato de teste...');
    const contact = await prisma.contact.create({
      data: {
        name: 'Contato Teste',
        phone: '11988888888',
        email: 'contato@exemplo.com',
        userId: user.id,
      },
    });
    console.log('✅ Contato criado:', contact.id);

    // Criar uma mensagem
    console.log('📝 Criando mensagem de teste...');
    const message = await prisma.message.create({
      data: {
        content: 'Olá, esta é uma mensagem de teste!',
        type: 'TEXT',
        status: 'PENDING',
        userId: user.id,
        contactId: contact.id,
      },
    });
    console.log('✅ Mensagem criada:', message.id);

    // Listar collections
    console.log('\n📊 Resumo:');
    const usersCount = await prisma.user.count();
    const contactsCount = await prisma.contact.count();
    const messagesCount = await prisma.message.count();

    console.log(`   Usuários: ${usersCount}`);
    console.log(`   Contatos: ${contactsCount}`);
    console.log(`   Mensagens: ${messagesCount}`);

    // Limpar dados de teste
    console.log('\n🧹 Limpando dados de teste...');
    await prisma.message.deleteMany({});
    await prisma.contact.deleteMany({});
    await prisma.user.deleteMany({});
    console.log('✅ Dados de teste removidos');

    console.log('\n✅ Todas as collections estão funcionando corretamente!');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabase();
