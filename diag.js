// 诊断脚本：用 electron 主进程环境打印真实的 userData 路径与配置读取结果
delete process.env.ELECTRON_RUN_AS_NODE;
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

app.setName('ai-pet-prompt-demo');

app.whenReady().then(() => {
  const userData = app.getPath('userData');
  const appName = app.getName();
  const settingsPath = path.join(userData, 'settings.json');
  let content = '(文件不存在)';
  try { content = fs.readFileSync(settingsPath, 'utf-8'); } catch (e) { content = '读取失败: ' + e.message; }

  console.log('=== DIAG START ===');
  console.log('appName    :', appName);
  console.log('userData   :', userData);
  console.log('settingsPath:', settingsPath);
  console.log('content    :', content);
  console.log('=== DIAG END ===');
  app.quit();
});
