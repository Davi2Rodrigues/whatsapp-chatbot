const { execSync } = require('child_process');

try {
  // Verifica se o Chromium está acessível
  const version = execSync(`${process.env.PUPPETEER_EXECUTABLE_PATH || 'chromium-browser'} --version`).toString();
  console.log('✅ Chromium OK:', version.trim());
  process.exit(0);
} catch (e) {
  console.error('❌ Chromium check failed:', e.message);
  process.exit(1);
}