module.exports = {
  apps: [{
    name: "meu-bot",
    script: "chatbot.js",
    watch: true,          // Reinicia automaticamente se o código mudar
    ignore_watch: ["node_modules", ".wwebjs_auth"],  // Ignora alterações nesses
    env: {
      NODE_ENV: "production"
    }
  }]
}