require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const express = require('express');
const moment = require('moment-timezone');
const axios = require('axios'); // Para health checks

// ===== CONFIGURAÇÕES =====
const INSTAGRAM_LINK = process.env.INSTAGRAM_URL || 'https://www.instagram.com/grsia.br/';
const SITE_URL = process.env.SITE_URL || 'https://grsia.com.br';
const ADMINS = process.env.ADMIN_NUMBERS?.split(',').map(num => `${num.trim()}@c.us`) || ['5511932010789@c.us'];
const PORT = process.env.PORT || 3000;

// ===== SERVIDOR WEB (OTIMIZADO) =====
const app = express();
app.use(express.json());

// Health check com horário BR
app.get('/', (req, res) => {
  const horaBR = moment().tz('America/Sao_Paulo').format('HH:mm:ss');
  res.status(200).json({ 
    status: 'online',
    horaBrasilia: horaBR,
    horarioComercial: isOfficeOpen() ? 'ABERTO' : 'FECHADO'
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

// ===== WHATSAPP CLIENT (CONFIGURAÇÃO AVANÇADA) =====
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, '.wwebjs_auth'),
    clientId: 'grsia-bot',
    restartOnAuthFail: true // Recuperação automática de falhas
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process',
      '--no-zygote'
    ],
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser'
  },
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
  },
  takeoverOnConflict: true // Evita conflitos de sessão
});

// ===== FUNÇÕES UTILITÁRIAS (ATUALIZADAS) =====
function isOfficeOpen() {
  const now = moment().tz('America/Sao_Paulo');
  const day = now.day(); // 0 (Domingo) a 6 (Sábado)
  const hour = now.hour();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 18; // Seg-Sex, 09h-18h BR
}

function instagramMsg() {
  return `\n\n📱 Siga nosso Instagram: ${INSTAGRAM_LINK}`;
}

// ===== HANDLERS (OTIMIZADOS) =====
async function handleGreeting(msg) {
  const contact = await msg.getContact();
  const name = contact.pushname || 'Cliente';
  await msg.reply(
    `👋 Olá *${name.split(" ")[0]}*! Sou o assistente da *GRsia*.\n\n` +
    `Escolha uma opção:\n\n` +
    `1️⃣ - Falar com advogado\n` +
    `2️⃣ - Agendar consulta\n` +
    `3️⃣ - Dúvidas sobre processo\n` +
    `4️⃣ - Outras perguntas\n\n` +
    `*Horário de atendimento:* Seg-Sex, 09h-18h (${moment().tz('America/Sao_Paulo').format('HH:mm')})`
  );
}

// ===== EVENTOS (COM RECUPERAÇÃO DE ERROS) =====
client.on('qr', qr => {
  console.log('✅ QR Code gerado! Use-o para autenticar:');
  qrcode.generate(qr, { small: true });
  
  // Opcional: Envie o QR por e-mail/API se estiver em produção
  if (process.env.NODE_ENV === 'production') {
    console.log('⚠️ Em produção, monitore os logs para obter o QR Code.');
  }
});

client.on('authenticated', () => {
  console.log('🔑 Autenticação realizada!');
});

client.on('ready', () => {
  console.log('🚀 Bot pronto para operação!');
  console.log(`⏰ Horário atual BR: ${moment().tz('America/Sao_Paulo').format('HH:mm:ss')}`);
});

client.on('disconnected', async (reason) => {
  console.log(`⚠️ Desconectado: ${reason}`);
  console.log('Tentando reconectar...');
  await client.initialize();
});

// ===== MENSAGENS (COM LOGS DETALHADOS) =====
client.on('message', async msg => {
  try {
    if (msg.fromMe || msg.isGroupMsg) return;

    const horaBR = moment().tz('America/Sao_Paulo').format('HH:mm:ss');
    console.log(`[${horaBR}] Mensagem de ${msg.from}: ${msg.body}`);

    // Fluxo principal (mesmo do seu código original)
    if (!isOfficeOpen()) {
      await msg.reply(
        `📅 Fora do horário de atendimento (09h-18h, Seg-Sex).\n` +
        `⏰ Hora atual: ${horaBR}\n\n` +
        `Volte em horário comercial! 😊` + instagramMsg()
      );
      return;
    }

    // ... (restante dos handlers de mensagem)

  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
  }
});

// ===== INICIALIZAÇÃO SEGURA =====
const startBot = async () => {
  try {
    await client.initialize();
    console.log('🔍 Inicializando bot...');
  } catch (error) {
    console.error('Falha na inicialização:', error);
    setTimeout(startBot, 5000); // Tenta novamente após 5 segundos
  }
};

startBot();

// ===== PING AUTOMÁTICO (EVITA COLD START) =====
if (process.env.NODE_ENV === 'production') {
  const PING_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  setInterval(() => {
    axios.get(PING_URL)
      .then(() => console.log(`♻️ Ping às ${moment().tz('America/Sao_Paulo').format('HH:mm:ss')}`))
      .catch(e => console.log('⚠️ Falha no ping:', e.message));
  }, 4 * 60 * 1000); // 4 minutos (Render free permite até 5min)
}

// ===== ENCERRAMENTO GRACIOSO =====
process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando bot...');
  await client.destroy();
  server.close(() => process.exit(0));
});