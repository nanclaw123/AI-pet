// 一次性脚本：写入默认 API 配置到 userData 目录（跨平台）
// 用法：node init-config.js  →  先 electron 环境跑一遍会自动补，但作为独立脚本需要兼容平台。
delete process.env.ELECTRON_RUN_AS_NODE;

const fs = require('fs');
const path = require('path');
const os = require('os');

// 跨平台获取 userData 目录（与 Electron app.getPath('userData') 一致）
function getUserDataDir() {
  const appName = 'ai-pet-prompt-demo';
  const home = os.homedir();
  switch (process.platform) {
    case 'darwin':  // macOS
      return path.join(home, 'Library', 'Application Support', appName);
    case 'win32':   // Windows
      return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), appName);
    default:        // Linux
      return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), appName);
  }
}

const dir = getUserDataDir();
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const settings = {
  apiKey: '',  // ⚠️ 请启动应用后在「设置」中填写，不要硬编码
  baseURL: 'https://ezr.sh/v1',
  model: 'deepseek-v4-flash',
  defaultStyle: 'rigorous',
};

const target = path.join(dir, 'settings.json');
fs.writeFileSync(target, JSON.stringify(settings, null, 2), 'utf-8');
console.log('✅ 已写入配置:', target);
console.log('   平台:', process.platform, '| 用户目录:', dir);
