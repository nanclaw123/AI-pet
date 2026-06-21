// main.js —— 主进程：窗口管理 + 托盘 + IPC + OpenAI 调用

// 防御：某些环境设置了 ELECTRON_RUN_AS_NODE，会让 electron 退化成普通 node 运行，
// 导致 app 等 API 不可用。这里检测到则提示并退出。
delete process.env.ELECTRON_RUN_AS_NODE;

const electron = require('electron');
if (!electron.app) {
  console.error('[启动失败] 请使用 Electron 运行（npm start），不要用 node 直接运行 main.js');
  process.exit(1);
}

const { app, BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage } = electron;
const path = require('path');
const fs = require('fs');

// 显式固定应用名，确保 userData 路径稳定（开发/打包一致）
app.setName('ai-pet-prompt-demo');

// ===== 单实例锁：防止多开 =====
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // 已有实例在跑，激活它并退出
  app.whenReady().then(() => {
    if (petWindow) {
      if (petWindow.isMinimized()) petWindow.restore();
      petWindow.show();
      petWindow.focus();
    }
    app.quit();
  });
} else {
  app.on('second-instance', () => {
    // 有人尝试启动第二个实例，激活本实例
    if (petWindow) {
      if (petWindow.isMinimized()) petWindow.restore();
      petWindow.show();
      petWindow.focus();
    }
    if (panelWindow) {
      panelWindow.show();
      panelWindow.focus();
    } else {
      createPanelWindow();
    }
  });
}

// ===== 全局错误捕获 + 日志 =====
const logPath = path.join(app.getPath('userData'), 'error.log');
function logError(scope, err) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${scope}] ${err && err.stack ? err.stack : err}\n`;
  try { fs.appendFileSync(logPath, line, 'utf-8'); } catch {}
  console.error(line);
}
process.on('uncaughtException', (e) => logError('uncaught', e));
process.on('unhandledRejection', (e) => logError('rejection', e));

let petWindow = null;
let panelWindow = null;
let tray = null;
let mouseTracker = null;

// ---------- 配置读写（简单本地存储 settings.json）----------
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    const s = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    return { ...defaultSettings(), ...s };
  } catch {
    // 默认预置 EasyRouter 配置
    return defaultSettings();
  }
}
function defaultSettings() {
  return {
    apiKey: '',  // ⚠️ 请在应用「设置」中填写，不要硬编码
    baseURL: 'https://ezr.sh/v1',
    model: 'deepseek-v4-flash',
    defaultStyle: 'rigorous',
    autoLaunch: false,        // 开机自启
    petPosX: null,            // 记忆宠物位置
    petPosY: null,
  };
}

function saveSettings(s) {
  fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2), 'utf-8');
}

// ---------- 历史记录（简单 history.json）----------
const historyPath = path.join(app.getPath('userData'), 'history.json');

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
  } catch {
    return [];
  }
}

function saveHistory(list) {
  fs.writeFileSync(historyPath, JSON.stringify(list, null, 2), 'utf-8');
}

// ---------- 养成系统（profile.json：等级/经验/使用次数）----------
const profilePath = path.join(app.getPath('userData'), 'profile.json');

function loadProfile() {
  try {
    const p = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
    // 兼容旧数据：补默认字段
    if (!p.skin) p.skin = 'aurora';
    if (!Array.isArray(p.accessories)) p.accessories = [];
    if (!p.style) p.style = 'tech';
    return p;
  } catch {
    return { exp: 0, level: 1, usageCount: 0, name: '小智', skin: 'aurora', accessories: [], style: 'tech' };
  }
}

function saveProfile(p) {
  fs.writeFileSync(profilePath, JSON.stringify(p, null, 2), 'utf-8');
}

// 每次成功优化 +10 经验，每 50 经验升一级
function addExp(amount = 10) {
  const p = loadProfile();
  p.exp += amount;
  p.usageCount += 1;
  const newLevel = Math.floor(p.exp / 50) + 1;
  const leveledUp = newLevel > p.level;
  p.level = newLevel;
  saveProfile(p);
  return { ...p, leveledUp };
}

// 向宠物窗口广播状态（idle / thinking / happy / levelup 等）
function setPetState(state, extra = {}) {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet-state', { state, ...extra });
  }
}

// 测试用：设置等级并通知宠物
function setLevelTest(level) {
  const p = loadProfile();
  p.level = level;
  p.exp = (level - 1) * 50;
  saveProfile(p);
  setPetState('levelup', { level });
}

// ---------- 宠物悬浮窗 ----------
function createPetWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  const saved = loadSettings();
  const initX = (saved.petPosX != null && Number.isFinite(saved.petPosX)) ? saved.petPosX : width - 280;
  const initY = (saved.petPosY != null && Number.isFinite(saved.petPosY)) ? saved.petPosY : 100;
  petWindow = new BrowserWindow({
    width: 240,
    height: 300,
    x: initX,
    y: initY,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  petWindow.loadFile('pet.html');

  // 关闭/移动时记忆宠物位置（防抖）
  let posSaveTimer = null;
  const savePosDebounced = () => {
    if (posSaveTimer) clearTimeout(posSaveTimer);
    posSaveTimer = setTimeout(() => {
      try {
        if (!petWindow || petWindow.isDestroyed()) return;
        const b = petWindow.getBounds();
        const s = loadSettings();
        s.petPosX = b.x; s.petPosY = b.y;
        saveSettings(s);
      } catch (e) { logError('savePos', e); }
    }, 600);
  };
  petWindow.on('move', savePosDebounced);
  petWindow.on('resize', savePosDebounced);

  // 右键菜单：快速操作
  petWindow.webContents.on('context-menu', () => {
    const menu = Menu.buildFromTemplate([
      { label: '💬 打开优化面板', click: () => createPanelWindow() },
      { label: '🎨 打扮宠物', click: () => { createPanelWindow(); setTimeout(() => {
        panelWindow?.webContents.executeJavaScript(`document.getElementById('wardrobeToggle').click();`).catch(() => {});
      }, 500); } },
      { label: '⚙️ 打开设置', click: () => { createPanelWindow(); setTimeout(() => {
        panelWindow?.webContents.executeJavaScript(`document.getElementById('settingsToggle').click();`).catch(() => {});
      }, 500); } },
      { type: 'separator' },
      { label: isHidden ? '🐾 出来吧！' : '💤 躲起来', click: () => slidePet(isHidden ? 'show' : 'hide') },
      { label: '🔁 重置位置', click: () => {
        const { width } = screen.getPrimaryDisplay().workAreaSize;
        petWindow.setBounds({ x: width - 280, y: 100, width: 240, height: 300 });
        if (isHidden) { isHidden = false; shownX = null; }
      }},
      { type: 'separator' },
      { label: '🚪 退出', click: () => app.quit() },
    ]);
    menu.popup();
  });

  // 眼睛跟随鼠标：定时把全局鼠标位置 + 宠物中心点发给渲染层
  startMouseTracking();
}

// ---------- 鼠标追踪（让机器人眼睛跟随光标）----------
function startMouseTracking() {
  if (mouseTracker) clearInterval(mouseTracker);
  mouseTracker = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed() || !petWindow.isVisible()) return;
    const pt = screen.getCursorScreenPoint();
    const b = petWindow.getBounds();
    const centerX = b.x + b.width / 2;
    const centerY = b.y + b.height / 2;
    petWindow.webContents.send('mouse-move', {
      dx: pt.x - centerX,
      dy: pt.y - centerY,
    });

    // ---- 空闲躲边逻辑 ----
    const dist = Math.hypot(pt.x - centerX, pt.y - centerY);
    if (dist < 160) {
      // 鼠标靠近 → 唤醒
      lastActiveAt = Date.now();
      if (isHidden) slidePet('show');
    }
    if (!isHidden && Date.now() - lastActiveAt > IDLE_TIMEOUT) {
      slidePet('hide');
    }
  }, 60);
}

// ---------- 空闲躲边 ----------
let isHidden = false;
let lastActiveAt = Date.now();
let sliding = false;
let shownX = null; // 记录躲藏前的 x
const IDLE_TIMEOUT = 15000; // 15 秒无操作躲起来

function slidePet(dir) {
  if (!petWindow || petWindow.isDestroyed() || sliding) return;
  if (dir === 'hide' && isHidden) return;
  if (dir === 'show' && !isHidden) return;
  sliding = true;

  const { width: screenW } = screen.getPrimaryDisplay().workAreaSize;
  const b = petWindow.getBounds();
  let targetX;

  if (dir === 'hide') {
    shownX = b.x;
    // 判断离左边还是右边近，往近的一侧躲，只露出一点点
    const peek = 36;
    if (b.x + b.width / 2 > screenW / 2) {
      targetX = screenW - peek;       // 躲到右边
    } else {
      targetX = -(b.width - peek);    // 躲到左边
    }
    petWindow.webContents.send('pet-state', { state: 'hiding' });
  } else {
    targetX = (shownX != null) ? shownX : b.x;
    petWindow.webContents.send('pet-state', { state: 'showing' });
    lastActiveAt = Date.now();
  }

  // 平滑滑动动画
  const startX = b.x;
  const steps = 14;
  let i = 0;
  const anim = setInterval(() => {
    i++;
    const t = i / steps;
    const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
    const x = Math.round(startX + (targetX - startX) * ease);
    if (!petWindow || petWindow.isDestroyed()) { clearInterval(anim); return; }
    petWindow.setBounds({ x, y: b.y, width: b.width, height: b.height });
    if (i >= steps) {
      clearInterval(anim);
      sliding = false;
      isHidden = (dir === 'hide');
    }
  }, 16);
}

// ---------- 优化面板窗 ----------
function createPanelWindow() {
  if (panelWindow) {
    panelWindow.show();
    panelWindow.focus();
    return;
  }
  // 面板居中显示，方便输入
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const panelW = 440;
  const panelH = 600;
  panelWindow = new BrowserWindow({
    width: panelW,
    height: panelH,
    x: Math.round((width - panelW) / 2),
    y: Math.round((height - panelH) / 2),
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  panelWindow.loadFile('panel.html');
  panelWindow.on('closed', () => { panelWindow = null; });
  // 失焦自动隐藏（注释掉以方便调试/输入时切换窗口不消失）
  // panelWindow.on('blur', () => { if (panelWindow) panelWindow.hide(); });
}

// ---------- 系统托盘 ----------
function createTray() {
  // 用一个简单的内置图标（16x16 透明占位），避免缺图标报错
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  const menu = Menu.buildFromTemplate([
    { label: '显示/隐藏宠物', click: () => { petWindow.isVisible() ? petWindow.hide() : petWindow.show(); } },
    { label: '打开优化面板', click: () => createPanelWindow() },
    { type: 'separator' },
    {
      label: '🔬 预览进化形态（测试）',
      submenu: [
        { label: 'Lv.1 雏形（头）', click: () => setLevelTest(1) },
        { label: 'Lv.2 成型（躯干）', click: () => setLevelTest(2) },
        { label: 'Lv.3 进化（手臂）', click: () => setLevelTest(3) },
        { label: 'Lv.4 强化（装甲）', click: () => setLevelTest(4) },
        { label: 'Lv.5 完全体（翅膀+皇冠）', click: () => setLevelTest(5) },
      ],
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);
  tray.setToolTip('AI 宠物 · 提示词优化助手');
  tray.setContextMenu(menu);
}

// ========== IPC 通道 ==========

// 点击宠物 → 打开/切换面板
ipcMain.on('toggle-panel', () => {
  lastActiveAt = Date.now();
  if (isHidden) slidePet('show');
  if (panelWindow && panelWindow.isVisible()) {
    panelWindow.hide();
  } else {
    createPanelWindow();
  }
});

ipcMain.on('close-panel', () => { if (panelWindow) panelWindow.hide(); });

// 拖动宠物窗口
ipcMain.on('move-pet', (_e, { dx, dy }) => {
  lastActiveAt = Date.now();
  const b = petWindow.getBounds();
  petWindow.setBounds({ x: b.x + dx, y: b.y + dy, width: b.width, height: b.height });
});

// 设置读写
ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('save-settings', (_e, s) => {
  const cur = loadSettings();
  const next = { ...cur, ...s };
  saveSettings(next);
  // 处理开机自启切换
  if (s.autoLaunch !== undefined) {
    app.setLoginItemSettings({ openAtLogin: !!s.autoLaunch });
  }
  return true;
});

// 历史读写
ipcMain.handle('get-history', () => loadHistory());
ipcMain.handle('clear-history', () => { saveHistory([]); return true; });

// 养成系统
ipcMain.handle('get-profile', () => loadProfile());

// 保存装扮（皮肤 + 装饰 + 风格），并通知宠物窗口实时更新
ipcMain.handle('save-appearance', (_e, { skin, accessories, style }) => {
  const p = loadProfile();
  if (skin) p.skin = skin;
  if (Array.isArray(accessories)) p.accessories = accessories;
  if (style) p.style = style;
  saveProfile(p);
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('appearance-change', { skin: p.skin, accessories: p.accessories, style: p.style });
  }
  return true;
});

// 测试用：直接设置等级，预览各形态
ipcMain.on('set-level', (_e, level) => {
  const p = loadProfile();
  p.level = level;
  p.exp = (level - 1) * 50;
  saveProfile(p);
  setPetState('levelup', { level });
});

// 宠物状态广播（渲染层主动触发，如点击逗它）
ipcMain.on('pet-react', (_e, state) => setPetState(state));

// 退出应用
ipcMain.on('app-quit', () => app.quit());

// ========== 提示词模板系统 ==========
// 每个模板包含：id / 名称 / 图标 / 风格描述 / 系统提示词 / 期望输出结构
const PROMPT_TEMPLATES = {
  general: {
    id: 'general', name: '通用优化', icon: '✨',
    desc: '适用大多数场景，按 RTCFC 框架优化',
    systemPrompt: `你是一位世界顶级的「提示词工程专家」。你的任务是把用户输入的、口语化或不完整的需求，优化成一条高质量、结构化、可直接用于大语言模型的提示词。

## 优化原则（RTCFC框架）
1. 角色(Role)：为 AI 设定合适的专家身份
2. 任务(Task)：清晰、具体、可执行
3. 上下文(Context)：补全合理的背景假设（不要臆造关键事实）
4. 格式(Format)：明确期望的输出结构
5. 约束(Constraint)：补充必要的限制与质量要求

## 输出要求
严格返回如下 JSON（不要任何额外文字）：
{
  "optimized": "优化后的完整提示词",
  "improvements": ["优化点1", "优化点2", "优化点3"]
}`,
    temperature: 0.4,
  },
  writing: {
    id: 'writing', name: '文案创作', icon: '✍️',
    desc: '朋友圈、小红书、短视频、营销文案',
    systemPrompt: `你是一位资深内容营销专家与爆款文案高手。把用户输入的模糊想法，优化成可直接使用的文案提示词。

## 优化方向
1. 明确平台语境（朋友圈/小红书/抖音/公众号等，可从需求推断）
2. 设定调性：情绪共鸣、反转、干货、种草、悬念等
3. 指定结构：钩子开头 → 核心内容 → 行动号召
4. 限定字数/段落（如未指定则按平台默认）
5. 加入表情符号、标签、话题的策略建议

## 输出要求
严格返回如下 JSON：
{
  "optimized": "优化后的完整提示词（包含角色、平台、调性、结构、字数等明确指令）",
  "improvements": ["优化点1", "优化点2", "优化点3"]
}`,
    temperature: 0.85,
  },
  code: {
    id: 'code', name: '编程开发', icon: '💻',
    desc: '代码生成、调试、重构、解释',
    systemPrompt: `你是一位资深全栈工程师与技术导师。把用户输入的编程需求，优化成清晰的代码任务提示词。

## 优化方向
1. 明确编程语言/框架/运行环境（从需求推断，不确定时让用户在提示词中预留占位）
2. 拆解任务：输入 → 处理逻辑 → 输出
3. 指定代码质量要求：注释、错误处理、类型安全、可读性
4. 要求提供：完整代码 + 简要说明 + 使用示例
5. 边界条件与异常处理建议

## 输出要求
严格返回如下 JSON：
{
  "optimized": "优化后的完整提示词",
  "improvements": ["优化点1", "优化点2", "优化点3"]
}`,
    temperature: 0.3,
  },
  learn: {
    id: 'learn', name: '学习辅导', icon: '📚',
    desc: '概念解释、知识梳理、答疑解惑',
    systemPrompt: `你是一位善于深入浅出的名师。把用户的学习问题，优化成能让 AI 给出高质量教学的提示词。

## 优化方向
1. 设定教师角色：耐心、用类比、循序渐进
2. 明确学习目标与当前水平（如未指定则默认初学者）
3. 要求结构化讲解：定义 → 核心要点 → 类比/例子 → 常见误区 → 小结
4. 鼓励追问与互动式教学
5. 适配学习者背景（学生/转行/兴趣）

## 输出要求
严格返回如下 JSON：
{
  "optimized": "优化后的完整提示词",
  "improvements": ["优化点1", "优化点2", "优化点3"]
}`,
    temperature: 0.5,
  },
  email: {
    id: 'email', name: '邮件公文', icon: '📧',
    desc: '请假、汇报、商务、投诉、感谢',
    systemPrompt: `你是一位商务沟通与公文写作专家。把用户的邮件需求，优化成专业的邮件提示词。

## 优化方向
1. 明确邮件类型（请假/汇报/邀请/投诉/感谢/求职等）
2. 设定语气：正式/半正式/亲切，符合中文职场礼仪
3. 指定结构：称呼 → 开门见山 → 详述 → 期待/行动 → 落款
4. 控制篇幅，突出重点
5. 提示收件人关系与场景（如未指定则让 AI 在提示词中预留）

## 输出要求
严格返回如下 JSON：
{
  "optimized": "优化后的完整提示词",
  "improvements": ["优化点1", "优化点2", "优化点3"]
}`,
    temperature: 0.4,
  },
};

// 风格描述映射（保留兼容旧 req.style）
const STYLE_DESC = {
  rigorous: '严谨：结构完整、逻辑严密、适合专业/正式任务',
  creative: '创意：鼓励发散、激发灵感、适合内容创作',
  concise: '简洁：精炼直接、去除冗余、适合快速任务',
};

// 获取模板列表（给前端用，不含大段 systemPrompt）
ipcMain.handle('get-templates', () => {
  return Object.values(PROMPT_TEMPLATES).map(t => ({
    id: t.id, name: t.name, icon: t.icon, desc: t.desc,
  }));
});

// ========== 流式优化 ==========
// 支持两种模式：
//   1) stream: true → 边生成边发送 chunk，最后发 done 事件
//   2) stream: false → 与原逻辑一致，一次性返回
ipcMain.handle('optimize', async (e, req) => {
  const settings = loadSettings();
  if (!settings.apiKey) {
    return { error: '请先在设置中填写 OpenAI API Key' };
  }

  setPetState('thinking');
  lastActiveAt = Date.now();
  if (isHidden) slidePet('show');

  try {
    // 延迟加载 openai 模块，加速启动
    const OpenAI = require('openai');
    const client = new OpenAI({
      apiKey: settings.apiKey,
      baseURL: settings.baseURL || undefined,
    });

    // 选模板：优先 req.template，否则用 general
    const tpl = PROMPT_TEMPLATES[req.template] || PROMPT_TEMPLATES.general;
    // 兼容旧风格参数：把 style 拼到 systemPrompt 后面
    let systemPrompt = tpl.systemPrompt;
    if (req.style && STYLE_DESC[req.style]) {
      systemPrompt += `\n\n## 当前风格\n${STYLE_DESC[req.style]}`;
    }
    const temperature = req.style === 'creative' ? Math.min(tpl.temperature + 0.3, 1.0) : tpl.temperature;

    const useStream = req.stream !== false;

    const completion = await client.chat.completions.create({
      model: settings.model || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature,
      stream: useStream,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: req.rawInput },
      ],
    });

    if (!useStream) {
      // 非流式：一次性返回（与原逻辑一致）
      const parsed = JSON.parse(completion.choices[0].message.content || '{}');
      return finalizeResult(parsed, req, completion.usage?.total_tokens);
    }

    // 流式：累积文本，逐 chunk 推送给前端
    let fullText = '';
    const sender = e.sender;
    for await (const chunk of completion) {
      const delta = chunk.choices?.[0]?.delta?.content || '';
      if (delta) {
        fullText += delta;
        // 发送原始 chunk，前端可做打字机效果
        if (!sender.isDestroyed()) {
          sender.send('optimize-chunk', { delta, full: fullText });
        }
      }
    }

    // 解析最终结果
    let parsed = {};
    try { parsed = JSON.parse(fullText); } catch { parsed = { optimized: fullText, improvements: [] }; }
    return finalizeResult(parsed, req, null);
  } catch (err) {
    setPetState('sad');
    return { error: err.message || String(err) };
  }
});

// 优化结果的收尾处理：存历史 + 加经验 + 返回结构
function finalizeResult(parsed, req, tokensUsed) {
  const result = {
    optimized: parsed.optimized || '',
    improvements: parsed.improvements || [],
    tokensUsed,
    template: req.template || 'general',
  };

  // 存历史
  const history = loadHistory();
  history.unshift({
    id: Date.now(),
    rawInput: req.rawInput,
    optimized: result.optimized,
    improvements: result.improvements,
    style: req.style,
    template: req.template || 'general',
    createdAt: Date.now(),
  });
  saveHistory(history.slice(0, 50));

  // 加经验 + 通知宠物开心/升级
  const prof = addExp(10);
  if (prof.leveledUp) {
    setPetState('levelup', { level: prof.level });
  } else {
    setPetState('happy');
  }
  result.profile = { level: prof.level, exp: prof.exp, usageCount: prof.usageCount, leveledUp: prof.leveledUp };
  return result;
}

// 核心：优化提示词（旧实现已被上方带模板/流式的新版替代，保留空壳避免重复定义报错）
// ⚠️ 实际逻辑见上方 "流式优化" 区块的 ipcMain.handle('optimize', ...)
// 这里删除旧的重复 handler，避免 EPIPE: duplicate handle 注册错误。
app.whenReady().then(() => {
  createPetWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // 托盘常驻，不退出
});
