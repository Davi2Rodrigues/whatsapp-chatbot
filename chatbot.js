require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');

// ===== CONFIGURAÇÕES =====
const INSTAGRAM_LINK = process.env.INSTAGRAM_URL || 'https://www.instagram.com/grsia.br/';
const SITE_URL = process.env.SITE_URL || 'https://grsia.com.br';
const ADMINS = process.env.ADMIN_NUMBERS 
  ? process.env.ADMIN_NUMBERS.split(',').map(num => `${num.trim()}@c.us`)
  : ['5511932010789@c.us'];

// ===== SETUP DO CLIENTE =====
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, '.wwebjs_auth'),
    clientId: 'grsia-bot'
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process'
    ],
    executablePath: process.env.CHROMIUM_PATH || null
  },
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
  }
});

// ===== VARIÁVEIS DE ESTADO =====
let activeHumanChats = new Set();

// ===== FUNÇÕES UTILITÁRIAS =====
function isOfficeOpen() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 18;
}

function isAdmin(number) {
  return ADMINS.includes(number);
}

function instagramMsg() {
  return `\n\nConheça nosso Instagram: ${INSTAGRAM_LINK}`;
}

// ===== HANDLERS =====
async function handleAdminCommands(msg) {
  const command = msg.body.toLowerCase().trim();
  
  if (command.startsWith('!finalizar ')) {
    const number = command.split(' ')[1].replace(/\D/g, '') + '@c.us';
    if (activeHumanChats.has(number)) {
      activeHumanChats.delete(number);
      await msg.reply(`✅ Atendimento finalizado para ${number}`);
      await client.sendMessage(number, 'Atendimento encerrado. Digite "menu" para novas opções.');
    }
    return true;
  }
  
  if (command === '!status') {
    await msg.reply(activeHumanChats.size > 0 
      ? `📊 Atendimentos ativos: ${activeHumanChats.size}\n${[...activeHumanChats].join('\n')}`
      : '✅ Todos os chats em modo automático'
    );
    return true;
  }
  
  return false;
}

async function handleGreeting(msg) {
  const contact = await msg.getContact();
  const name = contact.pushname || 'Cliente';
  await client.sendMessage(
    msg.from, 
    `👋 Olá *${name.split(" ")[0]}*! Sou o assistente da *GRsia*.\n\n` +
    `Escolha uma opção:\n\n` +
    `1️⃣ - Falar com advogado\n` +
    `2️⃣ - Agendar consulta\n` +
    `3️⃣ - Dúvidas sobre processo\n` +
    `4️⃣ - Outras perguntas`
  );
}

async function handleMenuOptions(msg) {
  const responses = {
    '1': `⏳ Conectando você com um advogado. Por favor, envie sua dúvida diretamente e aguarde.`,
    '2': `📅 Vou verificar os horários disponíveis e te retorno em breve.${instagramMsg()}`,
    '3': `⚖️ Aguarde um momento enquanto conectamos você com um advogado. Envie suas dúvidas.`,
    '4': `📌 Para outras informações: ${SITE_URL}${instagramMsg()}`
  };

  const response = responses[msg.body] || 'Opção inválida. Digite "menu" para ajuda.';
  await client.sendMessage(msg.from, response);

  if (msg.body === '1' || msg.body === '3') {
    activeHumanChats.add(msg.from);
    await client.sendMessage(msg.from, 
      'A partir de agora, você está em contato direto com nosso time. ' +
      'Envie suas dúvidas e um advogado responderá em breve.'
    );
  }
}

// ===== EVENTOS PRINCIPAIS =====
client.on('qr', qr => {
  console.log('🔑 QR Code para autenticação:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('🚀 Bot pronto para operação');
});

client.on('disconnected', (reason) => {
  console.log(`⚠️ Desconectado: ${reason}`);
});

client.on('message', async msg => {
  try {
    if (msg.fromMe || msg.isGroupMsg) return;

    // Bloqueio de áudios
    if (msg.hasMedia) {
      await client.sendMessage(msg.from, '⚠️ Por favor, envie apenas mensagens escritas. Áudios não são suportados.');
      return;
    }

    // Comandos admin
    if (isAdmin(msg.from)) {
      if (await handleAdminCommands(msg)) return;
    }

    // Atendimento humano
    if (activeHumanChats.has(msg.from)) {
      console.log(`💬 [ATENDIMENTO] ${msg.from}: ${msg.body}`);
      return;
    }

    // Fluxo automático
    if (!isOfficeOpen()) {
      await client.sendMessage(msg.from, 
        '📅 Fora do horário de atendimento.\n\n' +
        'Funcionamos de seg a sex, das 09:00 às 18:00. ' +
        'Por favor, retorne em horário comercial. 😊' + instagramMsg()
      );
      return;
    }

    const text = msg.body.toLowerCase().trim();

    if (/^(menu|ola|oi|olá)/i.test(text)) {
      await handleGreeting(msg);
    } 
    else if (/^[1-4]$/.test(text)) {
      await handleMenuOptions(msg);
    }
    else if (/(obrigado|obrigada|valeu)/i.test(text)) {
      await client.sendMessage(msg.from, '😊 Disponha! Estamos à disposição!' + instagramMsg());
    }
    else {
      await client.sendMessage(msg.from, 'Digite "menu" para ver as opções disponíveis.');
    }
  } catch (error) {
    console.error('Erro:', error);
  }
});

// ===== INICIALIZAÇÃO =====
console.log('🔄 Iniciando bot GRsia...');
client.initialize();

// ===== ENCERRAMENTO GRACIOSO =====
process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando bot...');
  try {
    await client.destroy();
    console.log('✅ Conexão encerrada corretamente');
    process.exit(0);
  } catch (err) {
    console.error('⚠️ Erro ao encerrar:', err);
    process.exit(1);
  }
});