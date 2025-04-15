/// ==================== CONFIGURAÇÃO INICIAL ==================== 
require('dotenv').config();
process.env.DISABLE_GPU = 'true'; // Otimização para servidores

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');

// ===== CONFIGURAÇÕES =====
const isProduction = process.env.NODE_ENV === 'production';
const activeChats = new Set();
let activeHumanChats = new Set();
const INSTAGRAM_LINK = process.env.INSTAGRAM_URL || 'https://www.instagram.com/grsia.br/';
const instagramMsg = `\n\nConheça nosso Instagram: ${INSTAGRAM_LINK}`;
const ADMINS = process.env.ADMIN_NUMBERS 
  ? process.env.ADMIN_NUMBERS.split(',').map(num => `${num.trim()}@c.us`)
  : ['5511932010789@c.us'];

// ===== CONFIGURAÇÃO FORTIFICADA DO CLIENTE =====
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, 'wwebjs_auth'),
    clientId: 'grsia-bot',
    backupSyncIntervalMs: 300000 // Backup a cada 5 minutos
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    timeout: 60000 // Aumenta timeout para 60s
  },
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    strict: false
  },
  takeoverOnConflict: true,
  takeoverTimeoutMs: 45000 // Aumentado para conexões lentas
});

// ===== SISTEMA DE RECONEXÃO APRIMORADO =====
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 7; // Aumentado para mais tentativas
const BASE_RECONNECT_DELAY = 5000;

async function safeInitialize() {
  try {
    console.log('🔧 Iniciando conexão...');
    await client.initialize();
    console.log('✅ Conexão estabelecida com sucesso');
    reconnectAttempts = 0;
  } catch (err) {
    const attempt = reconnectAttempts + 1;
    console.error(`❌ Falha na inicialização (${attempt}/${MAX_RECONNECT_ATTEMPTS}):`, err.message);
    
    if (attempt < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, attempt - 1), 120000); // Backoff exponencial com máximo de 2min
      console.log(`⏳ Tentando reconectar em ${delay/1000} segundos...`);
      setTimeout(safeInitialize, delay);
    } else {
      console.error('🚫 Número máximo de tentativas de reconexão atingido');
      process.exit(1);
    }
  }
}

// ===== FUNÇÕES PRINCIPAIS (MANTIDAS ORIGINAIS) =====
function isOfficeOpen() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 18;
}

function isAdmin(number) {
  return ADMINS.includes(number);
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
    '2': `📅 Vou verificar os horários disponíveis e te retorno em breve.` + instagramMsg,
    '3': `⚖️ Aguarde um momento enquanto conectamos você com um advogado. Envie suas dúvidas.`,
    '4': `📌 Para outras informações: ${process.env.SITE_URL || 'https://grsia.com.br'}` + instagramMsg
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

// ===== EVENTOS =====
client.on('qr', qr => {
  console.log('🔑 QR Code para autenticação:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('🚀 Bot pronto para operação');
});

client.on('disconnected', async (reason) => {
  console.log(`⚠️ Desconectado: ${reason}`);
  console.log('Tentando reconectar...');
  reconnectAttempts = 0;
  await safeInitialize();
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
    if (isAdmin(msg.from) && await handleAdminCommands(msg)) return;

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
        'Por favor, retorne em horário comercial. 😊' + instagramMsg
      );
      return;
    }

    const text = msg.body.toLowerCase().trim();

    if (/^(menu|Menu|dia|tarde|noite|oi|Oi|Olá|olá|ola|Ola)/i.test(text)) {
      await handleGreeting(msg);
    } 
    else if (/^[1-4]$/.test(text)) {
      await handleMenuOptions(msg);
    }
    else if (/(obrigado|obrigada|valeu|agradeço|grato|grata)/i.test(text)) {
      await client.sendMessage(msg.from, '😊 Disponha! Estamos à disposição!' + instagramMsg);
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
safeInitialize();

// ===== ENCERRAMENTO =====
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