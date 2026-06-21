# 🐱 AI 桌面宠物 · 提示词优化助手

一个基于 Electron 的桌面 AI 宠物助手，悬浮在桌面右上角，帮你把口语化需求优化成高质量提示词。

## ✨ 功能特性

### 🎨 多形态宠物
- 4 种外观风格（机器人/猫/史莱姆/精灵）
- 5 级成长进化（Lv.1→Lv.5 体型渐变）
- 15 种装饰（帽子/面部/身体/武器/伙伴 5 类）
- 眼睛跟随鼠标 + 4 种情绪状态（思考/开心/难过/升级）

### 🧠 提示词引擎
- **5 个专业模板**：通用 / 文案创作 / 编程开发 / 学习辅导 / 邮件公文
- **3 种风格**：严谨 / 创意 / 简洁（可叠加模板）
- **流式输出**：打字机效果，实时看到 AI 生成过程
- **对比视图**：原文 vs 优化结果双栏对照
- **历史记录**：最近 50 条，一键回填

### 📦 工程化
- 单实例锁（防多开）
- 全局错误捕获 + 日志
- 宠物位置记忆
- 开机自启可选
- 跨平台（macOS / Windows / Linux）

## 🚀 本地开发

```bash
cd demo
npm install
npm start
```

## 📦 本地打包

```bash
# 当前平台
npm run dist

# 指定平台
npm run dist:mac    # macOS dmg (arm64)
npm run dist:win    # Windows exe (nsis + portable)
npm run dist:linux  # Linux AppImage
```

产物在 `release/` 目录。

## ☁️ GitHub Actions 自动打包

项目已配置 GitHub Actions workflow（`.github/workflows/build.yml`），支持：

### 触发方式
1. **手动触发**：在 GitHub 仓库 Actions 页面点 "Run workflow"
2. **打 tag 自动触发**：`git tag v0.2.0 && git push origin v0.2.0`

### 支持平台
| 平台 | 产物 | Runner |
|------|------|--------|
| macOS | `.dmg` (arm64) | macos-latest |
| Windows | `.exe` (nsis 安装包 + portable 绿色版) | windows-latest |
| Linux | `.AppImage` | ubuntu-latest |

### 使用方法

#### 方式 1：手动触发（推荐首次使用）
1. 把项目推到 GitHub
2. 打开仓库 → **Actions** 标签页
3. 左侧选 **Build Desktop Apps**
4. 点右侧 **Run workflow** → 选择分支 → Run

#### 方式 2：打 Tag 触发（用于正式发版）
```bash
git tag v0.2.0
git push origin v0.2.0
```
推送后会自动：
- 三平台并行打包
- 创建 GitHub Release（草稿状态）
- 上传所有安装包到 Release

### 下载产物
- **手动触发**：Actions 页面 → 点对应 run → 拉到底部 Artifacts 下载
- **Tag 触发**：Releases 页面直接下载

## ⚙️ 配置

**⚠️ 安全提醒：请勿在代码中硬编码 API Key！**

首次使用需在应用「设置」中填写（配置仅保存在本地 `~/Library/Application Support/ai-pet-prompt-demo/`，不会进 git）：
- **API Key**：OpenAI 兼容接口的 Key（如 EasyRouter / DeepSeek / OpenAI）
- **Base URL**：接口地址（默认 `https://ezr.sh/v1`）
- **Model**：模型名（默认 `deepseek-v4-flash`）

> 💡 开发者克隆仓库后，启动应用会提示填写 Key，不会泄漏任何凭证。

## 📁 项目结构

```
demo/
├── main.js              # 主进程
├── preload.js           # 预加载（安全桥）
├── sfx.js               # 音效
├── pet.html             # 宠物窗口
├── panel.html           # 优化面板
├── init-config.js       # 配置初始化
├── build/
│   ├── icon.icns        # macOS 图标
│   ├── icon.ico         # Windows 图标
│   └── icon.png         # Linux 图标
└── .github/workflows/
    └── build.yml        # 三平台自动打包
```

## 📄 License

MIT
