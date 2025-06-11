require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const express = require('express');
const moment = require('moment-timezone'); // Adicionado para fuso horário

// ===== CONFIGURAÇÕES =====
const INSTAGRAM_LINK = process.env.INSTAGRAM_URL || 'https://www.instagram.com/grsia.br/';
const SITE_URL = process.env.SITE_URL || 'https://grsia.com.br';
const ADMINS = process.env.ADMIN_NUMBERS 
  ? process.env.ADMIN_NUMBERS.split(',').map(num => `${num.trim()}@c.us`)
  : ['5511932010789@c.us'];

// ===== SERVIDOR WEB PARA O RENDER =====
const app = express();
const PORT = process.env.PORT || 3000;

// Rota de health check otimizada (evita cold start)
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'online',
    horaBrasilia: moment().tz('America/Sao_Paulo').format('HH:mm:ss')
  });
});

// Inicia o servidor web
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

// ===== FUNÇÃO DE HORÁRIO COMERCIAL (ATUALIZADA) =====
function isOfficeOpen() {
  const now = moment().tz('America/Sao_Paulo');
  const day = now.day(); // 0 (Domingo) a 6 (Sábado)
  const hour = now.hour();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 18; // Seg-Sex, 09h-18h BR
}

// ===== CLIENTE WHATSAPP (OTIMIZADO) =====
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

// ... (restante do seu código permanece igual, exceto onde usava `new Date()`)

// ===== EVENTO 'message' (ATUALIZADO PARA LOGS DE HORÁRIO) =====
client.on('message', async msg => {
  try {
    if (msg.fromMe || msg.isGroupMsg) return;

    // Log para debug (mostra horário BR)
    const horaAtualBR = moment().tz('America/Sao_Paulo').format('HH:mm:ss');
    console.log(`[${horaAtualBR}] Mensagem de ${msg.from}: ${msg.body}`);

    // Restante da lógica permanece igual...
    if (!isOfficeOpen()) {
      await client.sendMessage(msg.from, 
        '📅 Fora do horário de atendimento (09h-18h, Seg-Sex).\n' +
        `Hora atual no BR: ${horaAtualBR}\n\n` + // Opcional: mostra o horário
        'Volte em horário comercial! 😊' + instagramMsg()
      );
      return;
    }

    // ... (restante do handler)
  } catch (error) {
    console.error('Erro:', error);
  }
});

// ... (restante do seu código)

// ===== PING AUTOMÁTICO (REDUZ COLD START) =====
if (process.env.NODE_ENV === 'production') {
  const axios = require('axios');
  const PING_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  
  // Ping a cada 5 minutos (Render free permite até 10min de inatividade)
  setInterval(() => {
    axios.get(`${PING_URL}/?ping=${Date.now()}`)
      .then(() => console.log(`✅ Ping às ${moment().tz('America/Sao_Paulo').format('HH:mm:ss')}`))
      .catch(e => console.log('⚠️ Falha no ping:', e.message));
  }, 5 * 60 * 1000); 
}