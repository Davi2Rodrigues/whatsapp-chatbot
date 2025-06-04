FROM node:18-alpine

WORKDIR /app

# Instala dependências do sistema
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Configura variáveis de ambiente do Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Instala dependências do app
COPY package*.json ./
RUN npm install

# Copia o código fonte
COPY . .

# Porta do serviço
EXPOSE 3000

# Comando de inicialização
CMD ["node", "src/bot.js"]