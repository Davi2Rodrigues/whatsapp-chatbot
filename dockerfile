FROM node:18-slim
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-khmeros \
    fonts-freefont-ttf
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "chatbot.js"]