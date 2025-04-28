# Use a versão mais recente do Node.js com Alpine
FROM node:20-alpine3.19

# Instala apenas as dependências ESSENCIAIS
RUN apk add --no-cache --upgrade \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    # Dependências mínimas para o WhatsApp Web
    libx11 \
    libxcomposite \
    libxdamage \
    libxext \
    libxfixes \
    libxrandr \
    libxrender \
    libxtst \
    cups-libs \
    dbus-libs \
    && rm -rf /var/cache/apk/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --production --ignore-scripts
COPY . .

# Configurações de segurança
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    DISABLE_GPU=true \
    NODE_ENV=production \
    # Reduz vulnerabilidades conhecidas
    CHROMIUM_FLAGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage"

# Usa xvfb-run diretamente (mais leve que Xvfb)
CMD ["xvfb-run", "--server-args=-screen 0 1024x768x24", "node", "chatbot.js"]