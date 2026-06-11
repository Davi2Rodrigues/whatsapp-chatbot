require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const express = require('express');
const moment = require('moment-timezone');
const fs = require('fs');

// ===== CONFIGURAÇÕES =====
const INSTAGRAM_LINK = process.env.INSTAGRAM_URL || 'https://www.instagram.com/grsia.br/';
const SITE_URL = process.env.SITE_URL || 'https://grsia.com.br';
const ADMINS = process.env.ADMIN_NUMBERS
  ?.split(',')
  .map(num => `${num.trim()}@c.us`);
const PORT = process.env.PORT || 3000;
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// ===== ESTADOS =====
const FLOW_TYPES = {
  MENU: 'menu',
  SCHEDULING: 'agendamento',
  PROCESS_QUERY: 'consulta_processo',
  HUMAN_CHAT: 'atendimento_humano'
};

// Feriados nacionais (DD/MM)
const FERIADOS = [
  '01/01', '21/04', '01/05', '07/09', 
  '12/10', '02/11', '15/11', '25/12'
];

// Armazenamento
const conversationState = new Map();
const humanSessions = new Map();
const pendingSchedules = new Map();
const adminInitiatedChats = new Set(); // Chats iniciados por admin
const humanSessionTimestamps = new Map(); // Timestamps dos atendimentos
let humanSessionCount = 0; // Contador de sessões humanas

// ===== SERVIDOR WEB =====
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'online',
    hora: moment().tz('America/Sao_Paulo').format('HH:mm:ss'),
    horarioComercial: isOfficeOpen() ? 'ABERTO' : 'FECHADO'
  });
});

const server = app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

// ===== FUNÇÕES UTILITÁRIAS =====
function normalizeInput(text) {
  return text
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isOfficeOpen() {
  const now = moment().tz('America/Sao_Paulo');
  const day = now.day();
  const hour = now.hour();
  
  if (day === 0) return false;
  if (day === 6) return hour >= 9 && hour < 14;
  return hour >= 8 && hour < 18;
}

function isAdmin(number) {
  return ADMINS.includes(number);
}

function formatCPF(cpf) {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function isValidDate(dateStr) {
  if (!/^[\d,\/]{2,5}$/.test(dateStr)) return false;
  
  const cleanDate = dateStr.replace(/,/g, '/');
  const [day, month] = cleanDate.split('/').map(Number);
  
  const months31 = [1, 3, 5, 7, 8, 10, 12];
  const months30 = [4, 6, 9, 11];
  
  if (month < 1 || month > 12) return false;
  
  if (month === 2) return day >= 1 && day <= 28;
  if (months31.includes(month)) return day >= 1 && day <= 31;
  if (months30.includes(month)) return day >= 1 && day <= 30;
  
  return false;
}

function isAvailableDate(dateStr) {
  const cleanDate = dateStr.replace(/,/g, '/');
  const [day, month] = cleanDate.split('/');
  const now = moment().tz('America/Sao_Paulo');
  const inputDate = moment(`${day}/${month}/${now.year()}`, 'DD/MM/YYYY');
  
  if (FERIADOS.includes(`${day}/${month}`)) {
    return { available: false, reason: 'feriado' };
  }
  
  const dayOfWeek = inputDate.day();
  
  if (dayOfWeek === 0) return { available: false, reason: 'domingo' };
  if (dayOfWeek === 6) return { available: true, reason: 'sabado', availableHours: '9h às 14h' };
  
  return { available: true, reason: 'dia_util', availableHours: '8h às 18h' };
}

function isThanks(text) {
  return ['obrigado', 'obrigada', 'agradeço', 'valeu', 'grato', 'grata']
    .some(word => text.includes(word));
}

function shouldProcessAsCommand(text, currentState) {
  if (currentState && currentState !== FLOW_TYPES.MENU) {
    return true;
  }
  
  const isMenuOption = /^[1-4]$/.test(text);
  const isGreeting = /^(menu|olá|oi|inicio|início|start|ola)$/i.test(text);
  const isThanksCommand = isThanks(text);
  
  return isMenuOption || isGreeting || isThanksCommand;
}

async function checkIfAdminInitiated(msg) {
  if (isAdmin(msg.from) && !msg.fromMe && !isAdmin(msg.to)) {
    adminInitiatedChats.add(msg.to);
    console.log(`🔧 Admin ${msg.from} iniciou chat com ${msg.to} - Bot desativado`);
  }
}

function shouldRespondToMessage(msg) {
  if (adminInitiatedChats.has(msg.from)) {
    return false;
  }
  if (msg.fromMe || msg.isGroupMsg) {
    return false;
  }
  if (humanSessions.has(msg.from)) {
    return false;
  }
  return true;
}

// ===== HANDLERS DE COMANDOS ADMIN =====
async function showAdminHelp(adminNumber) {
  const helpMessage = `🤖 *COMANDOS DISPONÍVEIS PARA ADMINS*\n\n` +
    `🔹 *Atendimento Humanizado*\n` +
    `!assumir [número] - Assumir chat com cliente\n` +
    `!finalizar [número] - Finalizar atendimento\n` +
    `!reativar [número] - Reativar bot para cliente\n` +
    `!statuschat [número] - Ver status do bot\n\n` +
    
    `🔹 *Agendamentos*\n` +
    `!confirmar [número] [data] [hora] [modalidade] - Confirmar agendamento\n` +
    `!agendamentos - Listar agendamentos pendentes\n\n` +
    
    `🔹 *Consultas*\n` +
    `!consultas - Listar consultas de processo pendentes\n\n` +
    
    `🔹 *Status do Sistema*\n` +
    `!status - Status geral do bot\n` +
    `!chats - Chats ativos em atendimento humano\n` +
    `!logs - Últimos logs do sistema\n\n` +
    
    `🔹 *Ajuda*\n` +
    `!ajuda - Mostrar esta mensagem de ajuda\n` +
    `!comandos - Lista de comandos disponíveis\n\n` +
    
    `*Exemplos:*\n` +
    `• !assumir 551199999999\n` +
    `• !confirmar 551199999999 25/08 14:30 online\n` +
    `• !statuschat 551199999999`;

  await client.sendMessage(adminNumber, helpMessage);
}

async function handleAdminCommands(msg) {
  const text = msg.body.toLowerCase().trim();
  const adminNumber = msg.from;

  // Comando de Ajuda
  if (text === '!ajuda' || text === '!comandos' || text === '!help') {
    await showAdminHelp(adminNumber);
    return true;
  }

  // Status do Sistema
  if (text === '!status') {
    const statusMessage = `📊 *STATUS DO SISTEMA GRsiaBot*\n\n` +
      `• Chats humanos ativos: ${humanSessions.size}\n` +
      `• Agendamentos pendentes: ${pendingSchedules.size}\n` +
      `• Chats com bot desativado: ${adminInitiatedChats.size}\n` +
      `• Horário do servidor: ${moment().tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm:ss')}\n` +
      `• Status: ONLINE ✅\n` +
      `• Uptime: ${Math.round(process.uptime() / 60)} minutos`;
    
    await msg.reply(statusMessage);
    return true;
  }

  // Listar chats ativos
  if (text === '!chats' || text === '!ativos') {
    if (humanSessions.size === 0) {
      await msg.reply('✅ Nenhum chat ativo em atendimento humano no momento');
    } else {
      let chatsList = `👥 *CHATS ATIVOS EM ATENDIMENTO HUMANO*\n\n`;
      humanSessions.forEach((admin, client) => {
        const timeActive = Math.round((Date.now() - (humanSessionTimestamps.get(client) || Date.now())) / 60000);
        chatsList += `• ${client} (por ${admin}) - ${timeActive} min\n`;
      });
      await msg.reply(chatsList);
    }
    return true;
  }

  // Listar agendamentos
  if (text === '!agendamentos' || text === '!agen') {
    if (pendingSchedules.size === 0) {
      await msg.reply('✅ Nenhum agendamento pendente de confirmação');
    } else {
      let agendamentosList = `📅 *AGENDAMENTOS PENDENTES DE CONFIRMAÇÃO*\n\n`;
      pendingSchedules.forEach((data, client) => {
        const timeAgo = Math.round((Date.now() - data.timestamp) / 60000);
        agendamentosList += `• ${client}\n` +
                          `  📆 ${data.date} | ⏰ ${data.period} | 💻 ${data.modality}\n` +
                          `  ⏱️ Solicitado há ${timeAgo} minutos\n\n`;
      });
      await msg.reply(agendamentosList);
    }
    return true;
  }

  // Reativar bot
  if (text.startsWith('!reativar ')) {
    const clientNumber = text.split(' ')[1] + '@c.us';
    adminInitiatedChats.delete(clientNumber);
    await msg.reply(`✅ Bot reativado para conversas com ${clientNumber}\n` +
                   `O bot agora responderá automaticamente a este cliente.`);
    return true;
  }

  // Status do chat
  if (text.startsWith('!statuschat ')) {
    const clientNumber = text.split(' ')[1] + '@c.us';
    const botStatus = adminInitiatedChats.has(clientNumber) ? '❌ DESATIVADO' : '✅ ATIVADO';
    const humanStatus = humanSessions.has(clientNumber) ? '👥 EM ATENDIMENTO HUMANO' : '🤖 MODO AUTOMÁTICO';
    
    await msg.reply(
      `📊 *STATUS DO CHAT* ${clientNumber}\n\n` +
      `• Bot automático: ${botStatus}\n` +
      `• Modo: ${humanStatus}\n` +
      `• Iniciado por admin: ${adminInitiatedChats.has(clientNumber) ? 'SIM' : 'NÃO'}`
    );
    return true;
  }

  // Logs recentes
  if (text === '!logs') {
    await msg.reply(
      `📋 *LOGS RECENTES DO SISTEMA*\n\n` +
      `• Bot iniciado: ${moment().tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm')}\n` +
      `• Total de chats humanos: ${humanSessionCount} hoje\n` +
      `• Agendamentos processados: ${pendingSchedules.size} pendentes\n\n` +
      `💡 Use !status para informações detalhadas`
    );
    return true;
  }

  // Assumir atendimento
  if (text.startsWith('!assumir ')) {
    const clientNumber = text.split(' ')[1] + '@c.us';
    await handleHumanTakeover(msg.from, clientNumber);
    return true;
  }

  // Finalizar atendimento
  if (text.startsWith('!finalizar ')) {
    const clientNumber = text.split(' ')[1] + '@c.us';
    await handleHumanEnd(clientNumber);
    return true;
  }

  // Confirmar agendamento
  if (text.startsWith('!confirmar ')) {
    const [, clientNumber, date, time, modality] = text.split(' ');
    await client.sendMessage(
      `${clientNumber}@c.us`,
      `📅 *Agendamento Confirmado!*\n\n` +
      `Data: ${date}\n` +
      `Horário: ${time}\n` +
      `Modalidade: ${modality || 'Presencial'}\n\n` +
      `📍 Rua Melvin Jones, 143 - Centro, Osasco/SP\n` +
      `⚠️ Chegar com 15min de antecedência.`
    );
    await msg.reply(`✅ Agendamento confirmado para ${clientNumber}`);
    return true;
  }

  return false;
}

// ===== HANDLERS PRINCIPAIS =====

// Menu Inicial
async function handleGreeting(msg) {
  const contact = await msg.getContact();
  await client.sendMessage(
    msg.from,
    `👋 Olá *${contact.pushname || 'Cliente'}*, sou o assistente da *GRsia Advocacia*.\n\n` +
    `*Como posso ajudar?*\n\n` +
    `1️⃣ - Agendar consulta\n` +
    `2️⃣ - Consultar processo\n` +
    `3️⃣ - Falar com atendente\n` +
    `4️⃣ - Horário de funcionamento\n\n` +
    `Digite o *número* da opção desejada`
  );
  conversationState.set(msg.from, FLOW_TYPES.MENU);
}

// Agendamento
async function handleScheduling(msg) {
  await client.sendMessage(
    msg.from,
    `📅 *Informe suas preferências para agendamento:*\n\n` +
    `• Data (DD/MM ou DD,MM)\n` +
    `• Período (manhã/tarde)\n` +
    `• Modalidade (online/presencial)\n\n` +
    `*Horários disponíveis:*\n` +
    `Seg-Sex: 8h-18h\n` +
    `Sábado: 9h-14h\n` +
    `Não atendemos domingos e feriados\n\n` +
    `Exemplo: "25/08 tarde presencial" ou "25,08 tarde, presencial"\n\n` +
    `Digite "cancelar" a qualquer momento para sair`
  );
  conversationState.set(msg.from, FLOW_TYPES.SCHEDULING);
}

async function handleScheduleConfirmation(msg) {
  const normalizedText = normalizeInput(msg.body);
  
  if (normalizedText.includes('cancelar')) {
    await client.sendMessage(msg.from, '❌ Agendamento cancelado. Digite *menu* para outras opções.');
    conversationState.delete(msg.from);
    return;
  }
  
  const parts = normalizedText.split(' ').filter(p => p.length > 0);
  
  if (parts.length < 3) {
    await client.sendMessage(
      msg.from,
      `❌ *Formato inválido.* Por favor, informe:\n\n` +
      `Data (DD/MM), Período e Modalidade\n\n` +
      `Exemplo: "25/08 tarde presencial" ou "25,08 tarde, online"\n\n` +
      `Ou digite "cancelar" para sair`
    );
    return;
  }
  
  const datePart = parts[0].replace(/,/g, '/');
  const period = parts[1].replace(/,/g, '');
  const modality = parts[2].replace(/,/g, '');
  
  if (!isValidDate(datePart)) {
    await client.sendMessage(
      msg.from,
      `❌ *Data inválida* (${datePart})\n\n` +
      `Por favor, informe uma data real no formato DD/MM\n` +
      `Exemplo: "25/08 tarde online" ou "25,08 tarde, presencial"\n\n` +
      `Ou digite "cancelar" para sair`
    );
    return;
  }
  
  const availability = isAvailableDate(datePart);
  
  if (!availability.available) {
    let reasonMsg = '';
    if (availability.reason === 'feriado') {
      reasonMsg = `❌ *${datePart} é feriado nacional* - não trabalhamos neste dia`;
    } else if (availability.reason === 'domingo') {
      reasonMsg = `❌ *Domingo* - não trabalhamos aos domingos`;
    }
    
    await client.sendMessage(
      msg.from,
      `${reasonMsg}\n\n` +
      `Por favor, escolha outra data ou digite "cancelar"`
    );
    return;
  }
  
  if (!['manhã', 'manha', 'tarde'].includes(period)) {
    await client.sendMessage(
      msg.from,
      `❌ *Período inválido* (${period})\n\n` +
      `Use "manhã" ou "tarde"\n` +
      `Exemplo: "25/08 tarde presencial" ou "25,08, tarde, online"\n\n` +
      `Ou digite "cancelar" para sair`
    );
    return;
  }
  
  if (availability.reason === 'sabado' && period === 'tarde') {
    await client.sendMessage(
      msg.from,
      `❌ *Aos sábados só atendemos pela manhã* (9h-14h)\n\n` +
      `Por favor, escolha outro horário ou digite "cancelar"`
    );
    return;
  }
  
  const formattedDate = datePart + '/' + moment().year();
  const formattedPeriod = period === 'manhã' || period === 'manha' ? 'manhã (8h-12h)' : 'tarde (13h-18h)';
  
  pendingSchedules.set(msg.from, {
    date: formattedDate,
    period,
    modality,
    timestamp: Date.now()
  });
  
  await client.sendMessage(
    msg.from,
    `🔍 *Confirme seu agendamento:*\n\n` +
    `📅 Data: ${formattedDate}\n` +
    `⏰ Período: ${formattedPeriod}\n` +
    `💻 Modalidade: ${modality}\n\n` +
    `Está correto? (sim/não/cancelar)`
  );
  conversationState.set(msg.from, 'CONFIRMACAO_AGENDAMENTO');
}

async function confirmSchedule(msg) {
  const normalizedText = normalizeInput(msg.body);
  const scheduleData = pendingSchedules.get(msg.from);

  if (normalizedText.includes('sim')) {
    ADMINS.forEach(admin => {
      client.sendMessage(
        admin,
        `📩 *NOVO AGENDAMENTO SOLICITADO*\n\n` +
        `Cliente: ${msg.from}\n` +
        `Data: ${scheduleData.date}\n` +
        `Período: ${scheduleData.period}\n` +
        `Modalidade: ${scheduleData.modality}\n\n` +
        `Para confirmar, responda:\n` +
        `"!confirmar ${msg.from.replace('@c.us', '')} [DATA] [HORÁRIO] [MODALIDADE]"`
      );
    });

    await client.sendMessage(
      msg.from,
      `✅ Solicitação enviada! Um atendente entrará em contato em breve.\n\n` +
      `📍 *Endereço presencial:*\n` +
      `Rua Melvin Jones, 143 - Centro, Osasco/SP - CEP: 06010-020`
    );
  } else if (normalizedText.includes('não') || normalizedText.includes('nao')) {
    await handleScheduling(msg);
    return;
  } else if (normalizedText.includes('cancelar')) {
    await client.sendMessage(msg.from, '❌ Agendamento cancelado. Digite *menu* para outras opções.');
  } else {
    await client.sendMessage(
      msg.from,
      `⚠️ Responda com "sim", "não" ou "cancelar"`
    );
    return;
  }

  conversationState.delete(msg.from);
  pendingSchedules.delete(msg.from);
}

// Consulta de Processo
async function handleProcessInquiry(msg) {
  await client.sendMessage(
    msg.from,
    `⚖️ *Consulta de Processo*\n\n` +
    `Por favor, envie:\n\n` +
    `• Seu *CPF* (11 dígitos, pode usar pontos ou vírgulas)\n` +
    `• Número do *processo* (se souber)\n\n` +
    `Formato: "CPF NUMERO_DO_PROCESSO"\n\n` +
    `Exemplo: "123.456.789-00 2023.456.789-1" ou "123,456,789,00 2023,456,789-1"`
  );
  conversationState.set(msg.from, FLOW_TYPES.PROCESS_QUERY);
}

async function handleProcessInfo(msg) {
  const normalizedText = normalizeInput(msg.body);
  const cpfMatch = normalizedText.match(/[\d,\.\- ]{11,14}/);
  const cpf = cpfMatch ? cpfMatch[0].replace(/[^\d]/g, '') : null;
  const processNumberMatch = normalizedText.replace(/[\d,\.\- ]{11,14}/, '').trim();
  const processNumber = processNumberMatch || null;

  if (!cpf || cpf.length !== 11) {
    await client.sendMessage(
      msg.from,
      `❌ *CPF inválido.* Por favor, envie 11 dígitos.\n\n` +
      `Pode usar pontos, vírgulas ou traços\n` +
      `Exemplo: "123.456.789-00 2023.456.789-1"`
    );
    return;
  }

  if (processNumber) {
    await client.sendMessage(
      msg.from,
      `✅ *Consulta registrada!*\n\n` +
      `CPF: ${formatCPF(cpf)}\n` +
      `Processo: ${processNumber}\n\n` +
      `Um advogado irá atualizar você em até *48h úteis*.`
    );

    ADMINS.forEach(admin => {
      client.sendMessage(
        admin,
        `⚖️ *CONSULTA DE PROCESSO*\n\n` +
        `Cliente: ${msg.from}\n` +
        `CPF: ${formatCPF(cpf)}\n` +
        `Processo: ${processNumber}\n\n` +
        `Para assumir: "!assumir ${msg.from.replace('@c.us', '')}"`
      );
    });
  } else {
    await client.sendMessage(
      msg.from,
      `🔍 *Você não sabe o número do processo?*\n\n` +
      `1. Se *já tem* o número, digite agora\n` +
      `2. Se *não sabe*, responda "não sei"\n\n` +
      `_Sua última tentativa:_\nCPF: ${formatCPF(cpf)}`
    );
    conversationState.set(msg.from, 'PROCESS_MISSING_NUMBER');
    return;
  }
  conversationState.delete(msg.from);
}

async function handleMissingProcessNumber(msg) {
  const normalizedText = normalizeInput(msg.body);
  
  if (normalizedText.includes('não sei') || normalizedText.includes('nao sei')) {
    await client.sendMessage(
      msg.from,
      `⚠️ *Localizaremos seu processo pelo CPF*\n\n` +
      `Um atendente entrará em contato em até *72h úteis*.`
    );

    ADMINS.forEach(admin => {
      client.sendMessage(
        admin,
        `🔎 *PROCESSO SEM NÚMERO*\n\n` +
        `Cliente: ${msg.from}\n` +
        `CPF: ${msg.body.match(/[\d,\.\- ]{11,14}/)?.[0].replace(/[^\d]/g, '')}\n\n` +
        `Necessário consulta manual.`
      );
    });
  } else {
    await handleProcessInfo(msg);
    return;
  }
  conversationState.delete(msg.from);
}

// Atendimento Humano
async function handleHumanTakeover(adminNumber, clientNumber) {
  humanSessions.set(clientNumber, adminNumber);
  humanSessionTimestamps.set(clientNumber, Date.now());
  humanSessionCount++;
  
  await client.sendMessage(
    clientNumber,
    `👨‍💼 *Atendimento Humano Iniciado*\n\n` +
    `Agora você está conversando diretamente com um atendente.\n` +
    `Por favor, descreva sua necessidade.`
  );
  
  await client.sendMessage(
    adminNumber,
    `✅ Você assumiu o chat com ${clientNumber}\n\n` +
    `Use "!finalizar ${clientNumber.replace('@c.us', '')}" para encerrar.`
  );
}

async function handleHumanEnd(clientNumber) {
  humanSessions.delete(clientNumber);
  humanSessionTimestamps.delete(clientNumber);
  
  await client.sendMessage(
    clientNumber,
    `🗨️ *Atendimento Encerrado*\n\n` +
    `Agradecemos seu contato! Digite *menu* se precisar de mais ajuda.`
  );
}

// Mensagens de Agradecimento
async function handleThanks(msg) {
  const normalizedText = normalizeInput(msg.body);
  
  if (isThanks(normalizedText)) {
    await client.sendMessage(
      msg.from,
      `😊 *Agradecemos seu contato!*\n\n` +
      `Foi um prazer ajudar! Se precisar de mais alguma coisa, é só chamar.\n\n` +
      `Tenha um ótimo dia! 🌟`
    );
  }
}

// Mostrar horários de funcionamento
async function showBusinessHours(msg) {
  await client.sendMessage(
    msg.from,
    `⏰ *Horário de Funcionamento*\n\n` +
    `Segunda a Sexta: 8h às 18h\n` +
    `Sábado: 9h às 14h\n` +
    `Domingo: Fechado\n\n` +
    `📍 Rua Melvin Jones, 143 - Centro, Osasco/SP\n\n` +
    `Digite *menu* para voltar às opções principais.`
  );
}

// Mensagem de erro
async function sendErrorMessage(clientNumber) {
  await client.sendMessage(
    clientNumber,
    '⚠️ Ocorreu um erro. Por favor, tente novamente ou digite *menu* para recomeçar.'
  );
}

// ===== CONFIGURAÇÃO DO CLIENTE WHATSAPP =====
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, '.wwebjs_auth'),
    clientId: 'grsia-bot',
    restartOnAuthFail: true
  }),
  puppeteer: {
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--start-maximized'
    ],
    executablePath: CHROMIUM_PATH,
    ignoreHTTPSErrors: false
  },
  takeoverOnConflict: true
});

// ===== TRATAMENTO DE ERROS E RECONEXÃO =====
const MAX_RETRIES = 5;
let retryCount = 0;

async function initializeClient() {
  try {
    if (fs.existsSync(path.join(__dirname, '.wwebjs_auth'))) {
      fs.rmSync(path.join(__dirname, '.wwebjs_auth'), { recursive: true });
    }

    await client.initialize();
    retryCount = 0;
    console.log('✅ WhatsApp client inicializado com sucesso');
  } catch (err) {
    console.error(`❌ Falha na inicialização (tentativa ${retryCount + 1}/${MAX_RETRIES}):`, err.message);
    
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      await new Promise(resolve => setTimeout(resolve, 5000 * retryCount));
      return initializeClient();
    } else {
      console.error('⚠️ Número máximo de tentativas alcançado. Encerrando...');
      process.exit(1);
    }
  }
}

client.on('disconnected', async (reason) => {
  console.log(`\n⚠️ Conexão perdida: ${reason}`);
  console.log('♻️ Tentando reconectar em 10 segundos...');
  
  try {
    await new Promise(resolve => setTimeout(resolve, 10000));
    await initializeClient();
  } catch (err) {
    console.error('❌ Falha na reconexão:', err);
  }
});

client.on('auth_failure', (msg) => {
  console.error('❌ Falha na autenticação:', msg);
  if (msg.includes('restart') || msg.includes('conflict')) {
    console.log('🔄 Tentando resolver automaticamente...');
    setTimeout(() => client.initialize(), 10000);
  }
});

// ===== EVENTOS DE MENSAGENS ADMIN =====
client.on('message_create', async (msg) => {
  if (msg.fromMe && isAdmin(msg.author || msg.from)) {
    const recipient = msg.to;
    if (!isAdmin(recipient)) {
      adminInitiatedChats.add(recipient);
      console.log(`🔧 Admin iniciou chat com ${recipient} - Bot desativado`);
      
      await client.sendMessage(
        msg.from,
        `🔧 *Bot desativado automaticamente* para ${recipient}\n\n` +
        `Agora você pode conversar normalmente sem interferência do bot.\n\n` +
        `Use *!ajuda* para ver todos os comandos disponíveis.`
      );
    }
  }
});

// ===== EVENTOS PRINCIPAIS =====
client.on('qr', qr => {
  console.log('🔑 QR Code para autenticação:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('🚀 Bot pronto para operação');
  console.log(`⏰ Horário BR: ${moment().tz('America/Sao_Paulo').format('HH:mm:ss')}`);
});

client.on('loading_screen', (percent, message) => {
  console.log(`🔄 Carregando: ${percent}% - ${message}`);
});

client.on('message', async msg => {
  if (msg.fromMe || msg.isGroupMsg) return;

  try {
    const normalizedText = normalizeInput(msg.body);
    const currentState = conversationState.get(msg.from);
    
    // Verifica se admin iniciou o chat
    await checkIfAdminInitiated(msg);
    
    // Verifica agradecimentos primeiro
    await handleThanks(msg);

    // Se não deve responder, ignora
    if (!shouldRespondToMessage(msg)) {
      return;
    }

    // Comandos Admin
    if (isAdmin(msg.from) && await handleAdminCommands(msg)) {
      return;
    }

    // Atendimento Humano Ativo
    if (humanSessions.has(msg.from)) {
      const adminNumber = humanSessions.get(msg.from);
      await client.sendMessage(adminNumber, `📩 ${msg.from}: ${msg.body}`);
      return;
    }

    // Se for apenas agradecimento, não processa como comando
    if (isThanks(normalizedText)) return;

    // Verifica se deve processar como comando
    if (!shouldProcessAsCommand(normalizedText, currentState)) {
      if (!currentState || currentState === FLOW_TYPES.MENU) {
        await handleGreeting(msg);
      }
      return;
    }

    // Fluxos Automáticos
    switch(currentState) {
      case FLOW_TYPES.SCHEDULING:
        await handleScheduleConfirmation(msg);
        break;
        
      case 'CONFIRMACAO_AGENDAMENTO':
        await confirmSchedule(msg);
        break;
        
      case FLOW_TYPES.PROCESS_QUERY:
        await handleProcessInfo(msg);
        break;
        
      case 'PROCESS_MISSING_NUMBER':
        await handleMissingProcessNumber(msg);
        break;
        
      default:
        const option = normalizedText.match(/[1-4]/)?.[0];
        if (option) {
          if (option === '1') await handleScheduling(msg);
          else if (option === '2') await handleProcessInquiry(msg);
          else if (option === '3') {
            await client.sendMessage(msg.from, `⏳ Conectando você com um atendente...`);
            if (ADMINS.length > 0) await handleHumanTakeover(ADMINS[0], msg.from);
          }
          else if (option === '4') await showBusinessHours(msg);
        } else {
          await handleGreeting(msg);
        }
    }
  } catch (err) {
    console.error('Erro ao processar mensagem:', err);
    await sendErrorMessage(msg.from);
  }
});

// ===== INICIALIZAÇÃO =====
async function startBot() {
  try {
    console.log('🚀 Iniciando bot GRsia...');
    await initializeClient();
  } catch (err) {
    console.error('❌ Erro crítico ao iniciar bot:', err);
    process.exit(1);
  }
}

startBot().catch(console.error);

// ===== ENCERRAMENTO GRACIOSO =====
process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando bot...');
  try {
    if (client.pupPage) {
      await client.destroy();
    }
    server.close(() => {
      console.log('✅ Servidor e conexão WhatsApp encerrados');
      process.exit(0);
    });
  } catch (err) {
    console.error('⚠️ Erro ao encerrar:', err);
    process.exit(1);
  }
});