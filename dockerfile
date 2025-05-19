# Use a imagem base do Node.js com suporte a Alpine (mais leve e compatível)
FROM node:18-alpine

# Instala dependências necessárias para o Puppeteer/Chromium
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && echo "http://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories \
    && echo "http://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories \
    && echo "http://dl-cdn.alpinelinux.org/alpine/edge/testing" >> /etc/apk/repositories \
    && apk add --no-cache --upgrade \
    libstdc++

# Configura variáveis de ambiente para o Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production

# Diretório de trabalho
WORKDIR /app

# Copia os arquivos de dependência primeiro (otimiza o cache do Docker)
COPY package*.json ./
RUN npm install --production

# Copia o resto do código
COPY . .

# Volume para dados persistentes do WhatsApp
VOLUME /app/wwebjs_auth

# Comando de inicialização
CMD ["node", "chatbot.js"]