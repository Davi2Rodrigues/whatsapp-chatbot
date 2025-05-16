# Use a tag específica para melhor reprodutibilidade
FROM node@sha256:52cbfd66512d9cec0e7faad8366466434b69d3b96e805282f959b414e59bb91d

# Metadata (opcional mas recomendado)
LABEL maintainer="davirodrigues7268@gmail.com"
LABEL version="1.0"
LABEL org.opencontainers.image.source="https://github.com/seu-usuario/seu-repo"
LABEL org.opencontainers.image.licenses="MIT"

# Instala dependências explicitamente
RUN apt-get update && \
    apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    libxss1 \
    && rm -rf /var/lib/apt/lists/*

# Configurações de ambiente
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

# Cria e configura diretório de trabalho
WORKDIR /app

# Copia seletivamente (melhor performance)
COPY package*.json ./
RUN npm ci --only=production

# Copia o resto após instalar dependências
COPY . .

# Volume para dados persistentes
VOLUME /app/wwebjs_auth

# Health check (opcional mas recomendado)
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node /app/Js_healthcheck.js || exit 1

# Entrypoint no formato JSON
ENTRYPOINT ["node", "chatbot.js"]