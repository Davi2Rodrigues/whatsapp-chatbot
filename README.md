# Sistema de Atendimento Automatizado para WhatsApp

Sistema desenvolvido para automatizar o atendimento inicial de clientes em um escritório de advocacia, utilizando Node.js, WhatsApp Web API e Express.

O projeto combina atendimento automatizado com transferência para atendimento humano, permitindo uma experiência mais eficiente para clientes e equipe administrativa.

---

## Funcionalidades

### Atendimento Automatizado
- Menu interativo via WhatsApp
- Navegação por opções
- Respostas automáticas

### Agendamento de Consultas
- Coleta de informações do cliente
- Validação de datas
- Confirmação de agendamentos

### Consulta de Processos
- Fluxo dedicado para consultas processuais
- Coleta de informações necessárias para atendimento

### Atendimento Humano
- Transferência de conversas para administradores
- Controle de sessões ativas
- Encerramento manual de atendimentos

### Administração
- Comandos administrativos
- Monitoramento de sessões
- Gerenciamento de atendimentos em andamento

### Confiabilidade
- Reconexão automática
- Tratamento de erros
- Persistência de autenticação

---

## Tecnologias Utilizadas

- Node.js
- JavaScript
- Express.js
- WhatsApp Web API
- Puppeteer
- Moment.js
- Dotenv

---

## Arquitetura

O sistema utiliza uma máquina de estados para controlar o fluxo das conversas.

Principais estados:

- MENU
- SCHEDULING
- PROCESS_QUERY
- HUMAN_CHAT

Essa abordagem permite manter o controle das interações dos usuários e facilita a manutenção do código.

---

## Estrutura do Projeto

```bash
.
├── chatbot.js
├── package.json
├── .env.example
├── .gitignore
├── Dockerfile
└── README.md
```

---

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
PORT=3000
SITE_URL=https://seusite.com
ADMIN_NUMBERS=5511999999999
CHROMIUM_PATH=/usr/bin/chromium
```

---

## Instalação

Clone o repositório:

```bash
git clone https://github.com/seu-usuario/whatsapp-law-firm-chatbot.git
```

Entre na pasta:

```bash
cd whatsapp-law-firm-chatbot
```

Instale as dependências:

```bash
npm install
```

Configure as variáveis de ambiente:

```bash
cp .env.example .env
```

Inicie a aplicação:

```bash
npm start
```

---

## Possíveis Melhorias Futuras

- Integração com banco de dados PostgreSQL
- Dashboard administrativo web
- Logs estruturados
- Testes automatizados
- Containerização completa com Docker Compose
- Integração com APIs externas

---

## Autor

Davi Brito Rodrigues

Estudante de Tecnologia da Informação (FIEB)

Projeto desenvolvido para aplicação prática em ambiente real.
