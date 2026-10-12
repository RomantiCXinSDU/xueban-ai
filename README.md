# 学伴AI（XuebanAI）— 项目交接文档

> **写给接手项目的同学**：这份文档假设你完全没有接触过 Node.js 和 Git，跟着一步一步做就能把项目跑起来。遇到问题先看文末的「常见问题排查」，90% 的问题都有答案。

---

## 目录

1. [这个项目是什么](#1-这个项目是什么)
2. [准备工作：安装三个软件](#2-准备工作安装三个软件)
3. [把代码下载到你电脑上](#3-把代码下载到你电脑上)
4. [首次运行（重点！）](#4-首次运行重点)
5. [日常开发流程](#5-日常开发流程)
6. [项目结构导览](#6-项目结构导览)
7. [功能模块对照表](#7-功能模块对照表)
8. [常见问题排查](#8-常见问题排查)
9. [已知问题和待办清单](#9-已知问题和待办清单)
10. [把你的修改上传回 GitHub](#10-把你的修改上传回-github)
11. [接口文档与更多资料](#11-接口文档与更多资料)

---

## 1. 这个项目是什么

**学伴AI** 是一个面向大学生的 AI 学习助手网页应用，当前完成度约 75-80%（MVP 阶段）。

它能做什么：
- 📖 **读资料**：上传文档（Word/PDF），AI 帮你总结内容
- 💬 **问 AI**：多轮对话问答
- 📷 **拍题**：上传题目图片，AI 解题 + 题型分析
- 📅 **学习计划**：AI 生成学习计划，支持进度追踪
- 🃏 **闪卡**：AI 生成记忆卡片
- 📝 **错题本**：记录、管理错题
- 还有：学习指南、复盘报告、音频概览、AI 私教等模块

技术一句话概括：**前端是一个大网页（index.html），后端是 Node.js + Express 服务器，数据存在 SQLite 和 JSON 文件里，AI 能力调用外部大模型 API（没配 API Key 时用内置模板兜底，功能照样能跑）。**

---

## 2. 准备工作：安装三个软件

### 2.1 安装 Node.js（运行后端必需）

1. 打开官网：https://nodejs.org/
2. 下载 **LTS 版本**（绿色大按钮那个），Windows 选 `.msi` 安装包
3. 双击安装，一路点 Next 即可（不用改任何选项）
4. 验证安装成功：按 `Win + R`，输入 `cmd` 回车，打开黑色命令行窗口，输入：

```bash
node -v
npm -v
```

如果分别显示版本号（比如 `v22.x.x` 和 `10.x.x`），说明装好了。

> ⚠️ 如果提示「'node' 不是内部或外部命令」，关掉命令行窗口重新打开再试一次；还不行就重启电脑。

### 2.2 安装 Git（下载和上传代码用）

1. 打开官网：https://git-scm.com/downloads
2. 下载 Windows 版，双击安装，一路 Next（默认选项就好）
3. 验证：新开一个命令行窗口，输入：

```bash
git --version
```

显示 `git version 2.x.x` 就成功了。

### 2.3 安装代码编辑器（写代码用）

推荐 **VS Code**：https://code.visualstudio.com/
（或者用 Trae / Cursor 都行，看你习惯）

---

## 3. 把代码下载到你电脑上

**方式一：用 Git 命令（推荐）**

在命令行里进入你想放项目的文件夹，比如放到 D 盘：

```bash
cd /d D:\
git clone https://github.com/RomantiCXinSDU/xueban-ai.git
cd xueban-ai
```

**方式二：直接下载压缩包（不想装 Git 的话）**

打开 https://github.com/RomantiCXinSDU/xueban-ai ，点绿色 **Code** 按钮 → **Download ZIP**，解压到任意位置。

> 💡 两种方式都行，选你觉得简单的。如果后面想用 Git 做本地版本管理，推荐方式一。

---

## 4. 首次运行（重点！）

### 第 1 步：创建配置文件 `.env`

**`.env` 文件包含私密配置（比如密钥），出于安全考虑没有上传到 GitHub，需要你自己创建。**

用 VS Code 打开项目文件夹，在 `backend` 文件夹里新建一个文件，命名为 `.env`（注意有个点），内容复制下面这段：

```ini
PORT=3000
NODE_ENV=development

# JWT配置（登录凭证加密用，随便改一串字母数字，别用默认值）
JWT_SECRET=换成你自己的随机字符串比如abc123xyz789
JWT_EXPIRES_IN=7d

# AI服务配置（没有Key也能跑，会用内置模板兜底）
AI_API_KEY=your_api_key_here
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_MODEL=gpt-3.5-turbo

# 数据库配置（保持默认即可）
DB_TYPE=sqlite
DB_NAME=./database/xuebanai.db

# CORS白名单（本地开发保持默认）
CORS_WHITELIST=http://localhost:3000

# 速率限制（保持默认）
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

> 💡 **关于 AI_API_KEY**：不填也能跑！所有 AI 功能会自动切换成内置模板模式（页面上会显示「离线模板」字样）。等你申请到 API Key 再填进去就能用真 AI 了。国内可以用 DeepSeek（https://platform.deepseek.com/ ）等 OpenAI 兼容接口，把 `AI_API_URL` 换成 `https://api.deepseek.com/v1/chat/completions`、`AI_MODEL` 换成 `deepseek-chat` 即可。

### 第 2 步：安装依赖包

命令行进入 `backend` 文件夹，执行：

```bash
cd 你的项目路径\xueban-ai\backend
npm install
```

> 💡 国内下载慢的话，先执行这句换国内镜像源（只需执行一次）：
> ```bash
> npm config set registry https://registry.npmmirror.com
> ```

### 第 3 步：启动服务器

还是在 `backend` 文件夹下：

```bash
npm start
```

看到类似下面的输出就是成功了：

```
🎓 学伴AI后端服务已启动，运行在 http://localhost:3000
📊 健康检查: http://localhost:3000/health
🤖 AI能力: ⚠️ 未配置API Key (使用Fallback)
```

### 第 4 步：打开网页

浏览器访问：**http://localhost:3000**

能看到「学伴AI - AI 学习工作台」页面就大功告成了！🎉

> ⚠️ **这个命令行窗口别关！** 关了服务器就停了。停止服务的方法：在窗口里按 `Ctrl + C`。

---

## 5. 日常开发流程

每次开始写代码的固定动作：

```bash
# 启动后端（backend 文件夹下）
npm start
```

**改代码后怎么看效果：**
- 改了 `backend/` 里的代码 → 必须**重启服务器**（Ctrl+C 停掉，再 `npm start`）
- 嫌重启麻烦可以用 `npm run dev`，改完代码自动重启（开发专用）
- 改了 `index.html` → 浏览器刷新（F5）就能看到

**查看日志**：后端运行日志在 `backend/logs/app.log`，命令行窗口也会实时打印。

---

## 6. 项目结构导览

```
xueban-ai/
├── index.html              # ★ 前端页面（整个前端就这一个文件，5000+行的大SPA）
├── assets/                 # logo 图片
├── docs/superpowers/       # 产品设计与开发计划文档
├── README.md               # 本文档
│
└── backend/                # ★ 后端代码都在这里
    ├── server.js           # 入口：启动服务器、注册路由、中间件
    ├── package.json        # 依赖清单（npm install 就是照着这个装）
    ├── .env                # 你的私密配置（自己创建，不会上传GitHub）
    ├── api-docs.md         # 接口文档（写得很全，对接前端必看）
    │
    ├── routes/             # 路由层：定义 URL 和功能的对应关系
    ├── controllers/        # 控制器层：处理请求参数、组织响应
    ├── services/           # 服务层：核心业务逻辑（最常改的地方）
    ├── utils/              # 工具类：日志、题型分析器
    ├── database/           # 数据存储（JSON 文件 + 运行时生成的 SQLite）
    ├── logs/               # 运行日志
    └── tests/              # 测试代码（npm test 运行）
```

**后端请求的处理流程**（理解这个就不会迷路）：

```
浏览器发请求 → routes/xxxRoutes.js（进哪个门）
            → controllers/xxxController.js（接待员：校验参数）
            → services/xxxService.js（真正干活的）
            → database/（存取数据）
            → 原路返回给浏览器
```

**举例**：想改「闪卡」的逻辑 → 看 `routes/flashcardRoutes.js` 找到接口定义 → 跳到 `controllers/flashcardController.js` → 核心逻辑在 `services/flashcardService.js`。

---

## 7. 功能模块对照表

| 模块 | 路由文件 | 服务文件 | 功能 |
|------|---------|---------|------|
| 用户认证 | authRoutes.js | profileService.js | 注册/登录/JWT鉴权 |
| AI 对话 | aiRoutes.js | aiService.js | 多轮对话、总结、计划生成（无Key时模板兜底） |
| 学习计划 | studyRoutes.js | studyPlanService.js | 计划增删改查、进度追踪 |
| 拍题/错题 | problemRoutes.js | ocrService.js | 图片上传、解题、错题本 |
| 产品工作台 | productRoutes.js | productService.js | 资料导入、工作区 |
| 闪卡 | flashcardRoutes.js | flashcardService.js | AI生成记忆卡片 |
| 学习指南 | learningGuideRoutes.js | learningGuideService.js | 学习指南生成 |
| 来源归属 | sourceAttributionRoutes.js | sourceAttributionService.js | 引用来源管理 |
| 报告生成 | reportGeneratorRoutes.js | reportGeneratorService.js | 复盘报告 |
| 音频概览 | audioOverviewRoutes.js | audioOverviewService.js | 资料转音频概览 |
| AI 私教 | personaRoutes.js | personaService.js | 多种人设的AI角色 |

**异步任务**：耗时操作（如报告生成）用 `services/jobService.js` 管理任务队列。
**文件导入**：Word/PDF/Excel 解析在 `services/fileImportService.js`（用了 mammoth、pdf-parse、xlsx 库）。

---

## 8. 常见问题排查

### ❓ 提示 `'node' 不是内部或外部命令`

Node.js 没装好或没进环境变量。重装 Node.js，装完**重开命令行窗口**再试。

### ❓ `npm install` 很慢或报错

```bash
npm config set registry https://registry.npmmirror.com
npm install
```

### ❓ 启动时报 `Port 3000 is already in use`（端口被占用）

方案 A：重启电脑（最简单粗暴）
方案 B：找到占用进程并结束：
```bash
netstat -ano | findstr :3000
taskkill /PID 上面查到的数字 /F
```
方案 C：改 `backend/.env` 里的 `PORT=3001`，用新端口访问。

### ❓ AI 功能显示「未配置API Key (使用Fallback)」

这是正常的兜底模式，功能都能用只是返回模板内容。想要真 AI 就去 `.env` 里填 `AI_API_KEY`，改完**重启服务器**。

### ❓ git push 报 `Failed to connect to github.com ... via 127.0.0.1`

你电脑开了代理软件（VPN/Clash）但代理没在运行。二选一：
1. 把代理软件打开再 push
2. 或临时清掉代理：`set HTTP_PROXY=` `set HTTPS_PROXY=` `set ALL_PROXY=`（命令行里逐条执行），再 push

### ❓ 页面脑图/思维导图渲染失败（控制台报 Markmap 错误）

已知问题，markmap 前端库未正确加载，见「已知问题」清单，属于待修复项。

### ❓ 页面白屏或接口 404

1. 确认命令行窗口里服务器还在跑（没被关掉）
2. 访问 http://localhost:3000/health 看是否返回 JSON
3. 确认浏览器访问的端口和 `.env` 里的 `PORT` 一致

### ❓ 改了后端代码没生效

后端改动必须重启服务器（Ctrl+C → `npm start`），或者用 `npm run dev` 自动重启。

---

## 9. 已知问题和待办清单

交接时已知的问题，接手后可以优先处理：

| # | 问题 | 位置 | 严重度 |
|---|------|------|--------|
| 1 | 控制台报错 `checkInFocusUI is not defined`（2处） | index.html 约 3888 行、5929 行附近 | 🟡 不影响主流程 |
| 2 | Markmap 思维导图渲染失败（库未加载） | index.html 约 5046 行 renderMarkmap | 🟡 功能缺失 |
| 3 | 拍题的 OCR 是模拟实现，非真实文字识别 | services/ocrService.js | 🟡 Demo 级 |
| 4 | 速率限制只在 .env 配了参数，中间件未接入 | server.js | 🟠 待实现 |
| 5 | 部分功能（研究报告等）为 Demo 级别 | 见 项目总结文档.md | 🟡 |

**产品层面的待办**（更完整的差距分析见根目录 `项目总结文档.md` 和 `docs/superpowers/` 里的设计文档）：
- 真实 OCR 接入（拍照解题的核心体验）
- AI 流式输出（打字机效果）
- 知识库/RAG 检索
- 部署上线（当前只能本地跑）

---

## 10. 关于保存你的修改（本地备份）

这个仓库是**只读**的，你改了代码不用上传回 GitHub，就在自己电脑上改就行。但**一定要勤备份**，避免电脑崩了白干：

### 方式 A：Git 本地版本记录（推荐）

每次改完一批功能，在命令行里执行：

```bash
git add .
git commit -m "这里写你这次改了什么，比如：修复了闪卡页面的显示bug"
```

> 💡 这样就把当前进度存进了本地 Git 仓库（纯本地，和 GitHub 无关）。改坏了随时可以回到上一次提交：
> ```bash
> git --no-pager log --oneline        # 查看所有提交记录
> git checkout -- .                   # 把所有文件恢复到最近一次提交的状态（慎用！）
> git reset --hard 提交哈希           # 回到某次具体提交（慎用！会丢改动）
> ```

### 方式 B：手动拷贝

嫌 Git 麻烦？每隔几天把整个项目文件夹复制一份，加个日期后缀，比如 `xueban-ai-backup-1015`，存到别的盘或网盘里就行。

> ⚠️ **千万不要**把这些文件上传到任何公开平台：`.env`（有密钥）、`node_modules/`、`logs/`。如果以后想把你的版本也传到 GitHub 做存档，`.gitignore` 已经配好了会自动忽略它们。

---

## 11. 接口文档与更多资料

| 资料 | 位置 | 说明 |
|------|------|------|
| 接口文档 | backend/api-docs.md | 所有 API 的请求/响应格式，对接前端必读 |
| 项目总结 | 项目总结文档.md | 项目全貌、完成度评估、商业化差距分析 |
| UI 需求 | 前端交互UI需求.md | 前端交互设计的需求说明 |
| 设计文档 | docs/superpowers/specs/ | 产品升级设计方案 |
| 开发计划 | docs/superpowers/plans/ | 产品升级的开发计划 |
| 健康检查 | http://localhost:3000/health | 运行时验证服务状态 |

---

*文档生成日期：2026-10-12 ｜ 基于 commit 084eb14 ｜ 有问题优先查第 8 节，解决不了联系项目交接人*
