require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const express = require('express');
const moment = require('moment-timezone');

// ===== CONFIGURAÇÕES =====
const INSTAGRAM_LINK = process.env.INSTAGRAM_URL || 'https://www.instagram.com/grsia.br/';
const SITE_URL = process.env.SITE_URL || 'https://grsia.com.br';
const ADMINS = process.env.ADMIN_NUMBERS?.split(',').map(num => `${num.trim()}@c.us`) || ['5511932010789@c.us'];
const PORT = process.env.PORT || 3000;

// ===== SERVIDOR WEB =====
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  const horaBR = moment().tz('America/Sao_Paulo').format('HH:mm:ss');
  res.status(200).json({ 
    status: 'online',
    horaBrasilia: horaBR
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

// ===== CLIENTE WHATSAPP (CONFIGURAÇÃO ATUALIZADA) =====
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, '.wwebjs_auth'),
    clientId: 'grsia-bot',
    restartOnAuthFail: true,     // Reconecta automaticamente
    bypassPathLock: true         // Ignora bloqueio de arquivos no Windows
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process'
    ],
    executablePath: process.env.CHROMIUM_PATH || 
      (process.platform === 'win32' 
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' 
        : '/usr/bin/chromium-browser')
  },
  takeoverOnConflict: true      // Evita múltiplas sessões
});

// ===== TRATAMENTO DE ERROS APRIMORADO =====
client.on('disconnected', async (reason) => {
  console.log(`⚠️ Desconectado: ${reason}`);
  try {
    // Limpa recursos e reconecta após 5 segundos
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('♻️ Tentando reconectar...');
    await client.initialize();
  } catch (err) {
    console.error('❌ Falha na reconexão:', err);
  }
});

client.on('auth_failure', msg => {
  console.error('❌ Falha na autenticação:', msg);
  // Força nova geração de QR Code
  client.destroy().then(() => client.initialize());
});

// ===== EVENTOS PRINCIPAIS =====
client.on('qr', qr => {
  console.log('🔑 QR Code para autenticação:');
  qrcode.generate(qr, { small: true });
  
  // Opcional: Salva o QR em arquivo (útil para servidores remotos)
  require('fs').writeFileSync('qrcode.txt', qr);
});

client.on('authenticated', () => {
  console.log('✅ Autenticado no WhatsApp!');
});

client.on('ready', () => {
  console.log('🚀 Bot pronto para operação');
  console.log(`⏰ Horário BR: ${moment().tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm:ss')}`);
});

// ... (Seus handlers de mensagem existentes continuam aqui)

// ===== INICIALIZAÇÃO SEGURA =====
const startBot = async () => {
  try {
    await client.initialize();
  } catch (error) {
    console.error('❌ Falha crítica:', error);
    process.exit(1); // Encerra o processo para evitar loop de erros
  }
};

startBot();

// ===== ENCERRAMENTO GRACIOSO =====
process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando bot...');
  try {
    await client.destroy();
    server.close(() => {
      console.log('✅ Servidor e WhatsApp encerrados');
      process.exit(0);
    });
  } catch (err) {
    console.error('⚠️ Erro ao encerrar:', err);
    process.exit(1);
  }
});