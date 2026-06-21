// preload.js —— 安全桥：只暴露白名单方法给渲染层
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 宠物
  togglePanel: () => ipcRenderer.send('toggle-panel'),
  closePanel: () => ipcRenderer.send('close-panel'),
  movePet: (dx, dy) => ipcRenderer.send('move-pet', { dx, dy }),
  petReact: (state) => ipcRenderer.send('pet-react', state),
  // 监听：鼠标移动（眼睛跟随）
  onMouseMove: (cb) => ipcRenderer.on('mouse-move', (_e, data) => cb(data)),
  // 监听：宠物状态变化（thinking/happy/sad/levelup）
  onPetState: (cb) => ipcRenderer.on('pet-state', (_e, data) => cb(data)),
  // 监听：装扮变化（皮肤/装饰）
  onAppearanceChange: (cb) => ipcRenderer.on('appearance-change', (_e, data) => cb(data)),
  // 优化（支持流式：返回 Promise，期间通过 onOptimizeChunk 接收增量）
  optimize: (req) => ipcRenderer.invoke('optimize', req),
  // 监听：流式输出的增量 chunk
  onOptimizeChunk: (cb) => ipcRenderer.on('optimize-chunk', (_e, data) => cb(data)),
  // 模板列表
  getTemplates: () => ipcRenderer.invoke('get-templates'),
  // 设置
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  // 历史
  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  // 养成
  getProfile: () => ipcRenderer.invoke('get-profile'),
  setLevel: (level) => ipcRenderer.send('set-level', level),
  saveAppearance: (data) => ipcRenderer.invoke('save-appearance', data),
  // 应用控制
  quitApp: () => ipcRenderer.send('app-quit'),
});
