FROM node:18-slim

# Instala Chromium e fonts
RUN apt-get update && \
    apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    libxss1 \
    --no-install-recommends

# Configura Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Volume para sessões persistentes
VOLUME /app/wwebjs_auth

CMD ["node", "chatbot.js"]  # Note o maiúsculo!