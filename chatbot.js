const qrcode = require('qrcode-terminal');
const venom = require('venom-bot');

venom
  .create({
    session: 'session-name',
    multidevice: true,
    headless: false // Desativa o modo headless para depuração
  })
  .then((client) => {
    console.log('Tudo certo! WhatsApp conectado.');

    // Função para enviar mensagens com delay
    const delay = ms => new Promise(res => setTimeout(res, ms));

    // Função para enviar mensagens com simulação de digitação
    async function sendMessageWithTyping(chatId, message, delayTime = 1000) {
      await delay(delayTime);
      await client.startTyping(chatId);
      await delay(delayTime);
      await client.sendText(chatId, message);
    }

    // Função para verificar se está dentro do horário de atendimento
    function isOfficeOpen() {
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 (Domingo) a 6 (Sábado)
      const hour = now.getHours();
      const minute = now.getMinutes();

      // Verifica se é dia útil (segunda a sexta) e horário comercial (09:00 às 18:00)
      return dayOfWeek >= 1 && dayOfWeek <= 5 && // Segunda (1) a Sexta (5)
             (hour > 9 || (hour === 9 && minute >= 0)) && // Após 09:00
             (hour < 18 || (hour === 18 && minute === 0)); // Antes das 18:00
    }

    // Função para responder a saudações
    async function handleGreeting(msg) {
      console.log('Função handleGreeting chamada');
      const contact = await client.getContact(msg.from);
      const name = contact.pushname || contact.name || 'Cliente';

      await sendMessageWithTyping(
        msg.from,
        `👋 Olá, *${name.split(" ")[0]}*! Sou o assistente virtual da empresa *GRsia*. Como posso ajudá-lo hoje? Por favor, digite uma das opções abaixo:\n\n` +
        `1️⃣ - Quero falar com um advogado.\n` +
        `2️⃣ - Agendar consulta.\n` +
        `3️⃣ - Dúvidas sobre meu processo.\n` +
        `4️⃣ - Outras perguntas.`
      );
    }

    // Função para responder a agradecimentos
    async function handleThanks(msg) {
      console.log('Função handleThanks chamada');
      await client.sendText(msg.from, 'De nada! Estou aqui para ajudar. 😊');
    }

    // Função para processar opções do menu
    async function handleMenuOptions(msg) {
      console.log('Função handleMenuOptions chamada');
      switch (msg.body) {
        case '1':
          await sendMessageWithTyping(msg.from, 'Ótimo! Vamos encaminhar a conversa para um de nossos atendentes.\n\nAguarde por gentileza.');
          await sendMessageWithTyping(msg.from, 'Já conhece a nossa página oficial no instagram? Se não conhece, venha dar uma olhada! https://www.instagram.com/grsia.br/');
          break;

        case '2':
          await sendMessageWithTyping(msg.from, 'Perfeito!\nVou dar uma olhada em nossa agenda e já te retorno sobre os horários e advogados disponíveis.\n');
          await sendMessageWithTyping(msg.from, 'Já conhece a nossa página oficial no instagram? Se não conhece, venha dar uma olhada! https://www.instagram.com/grsia.br/');
          break;

        case '3':
          await sendMessageWithTyping(msg.from, 'Entendi! Aguarde um momento para falar com um de nossos advogados e consultar o status de seu processo.\n');
          await sendMessageWithTyping(msg.from, 'Já conhece a nossa página oficial no instagram? Se não conhece, venha dar uma olhada! https://www.instagram.com/grsia.br/');
          break;

        case '4':
          await sendMessageWithTyping(msg.from, 'Se você tiver outras dúvidas ou precisar de mais informações, por favor, fale aqui nesse WhatsApp ou visite nosso site: https://grsia.com.br');
          break;

        default:
          await sendMessageWithTyping(msg.from, 'Desculpe, não entendi. Por favor, escolha uma das opções válidas.');
          break;
      }
    }

    // Funil de mensagens
    client.onMessage(async (msg) => {
      try {
        console.log('Evento onMessage acionado:', msg.body);

        // Verifica se está dentro do horário de atendimento
        if (!isOfficeOpen()) {
          await client.sendText(msg.from, '📅 Fora do horário de atendimento.\n\nNosso escritório funciona de segunda a sexta, das 09:00 às 18:00 (horário de Brasília). Por favor, retorne em um horário comercial. 😊');
          return;
        }

        // Verifica se a mensagem é um áudio
        if (msg.isMedia || msg.isMMS) {
          await client.sendText(msg.from, 'Por favor, envie apenas mensagens escritas. Áudios não são suportados.');
          return;
        }

        // Verifica se a mensagem é uma saudação inicial
        if (msg.body.match(/(menu|Menu|dia|tarde|noite|oi|Oi|Olá|olá|ola|Ola)/i)) {
          await handleGreeting(msg);
          return;
        }

        // Verifica se a mensagem é de agradecimento
        if (msg.body.match(/(obrigado|obrigada|valeu|agradeço|grato|grata)/i)) {
          await handleThanks(msg);
          return;
        }

        // Verifica se a mensagem é uma das opções válidas
        await handleMenuOptions(msg);
      } catch (error) {
        console.error('Erro ao processar mensagem:', error);
        await client.sendText(msg.from, 'Ops! Ocorreu um erro. Por favor, tente novamente mais tarde.');
      }
    });
  })
  .catch((erro) => {
    console.error('Erro ao iniciar o bot:', erro);
  });