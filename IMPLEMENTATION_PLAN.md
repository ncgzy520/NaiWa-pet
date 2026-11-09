# 奶蛙 (Naiwa / Naifrog) 云端养成全栈网站 — AI Agent 零基础完整开发执行计划书 (Master Implementation Plan)

> **文档定位**：本文档为 **AI Agent 级完全自治开发蓝图（Blueprint）**。任何全新的 AI 编程助手（Agent）或开发者只需阅读本文档，即可在无需额外询问上下文的情况下，从零完成整个全栈项目的前端、后端、数据库、2D 精灵动画引擎、3D Three.js 建模引擎、小游戏、AI 聊天网关及 Azure 部署配置的编写与联调。

---

## 1. 项目概览与工作区上下文

### 1.1 项目目标
构建一个基于 Web 的全栈电子宠物养成与轻社交网站，主角为全网热门 AI 萌宠形象 **“奶蛙 (Naiwa / Naifrog)”**（圆润连体明黄身体、奶油白大肚皮、棕褐色渐变捧肚手掌与三趾蛙蹼脚、翠绿大蛙眼、仰头捧腹狂笑）。
支持 **2D 原版素材模式** 与 **3D 立体交互模式** 一键切换，包含养成互动、赚金币小游戏、商城换装、多模型 AI 聊天（Azure OpenAI / DeepSeek / Gemini + 离线兜底）、多玩家排行榜、好友房间串门投喂与留言板，并支持通过 GitHub Actions 一键部署至 Azure App Service（或 Docker 虚拟机）。

### 1.2 现有素材路径说明（已存在于项目目录中）
在项目根目录 `C:\Users\HP\.gemini\antigravity\scratch\nailong-pet\` 下，已解压就绪以下两套核心原生素材，开发时需要在初始化脚本或静态服务中将它们挂载到前端可访问路径：

1. **高清 3D 渲染序列帧包 (`./naiwa-assets/`，源自桌面 `素材.nwp`)**：
   - 分辨率：`288 × 368` 像素，透明背景 PNG，帧率 `30 FPS`。
   - `naiwa-assets/idle.png`：默认侧身双手捧白肚皮待机图。
   - `naiwa-assets/hover.png`：鼠标悬停状态图。
   - `naiwa-assets/look/00.png` ~ `10.png`：共 11 帧，水平视线跟随帧（从左看到右）。
   - `naiwa-assets/blink/0/00.png ~ 06.png` 及 `blink/1/00.png ~ 06.png`：2 组各 7 帧的自然眨眼序列。
   - `naiwa-assets/laugh/0000.png` ~ `0421.png`：共 422 帧（14.06 秒），完整的高清仰头张嘴、眯眼、双手疯狂拍打白肚皮捧腹爆笑动画。

2. **全动作精灵表 (`./codex-pet-naiwa-repo/codex-pet-naiwa-main/naifrog/`，源自 GitHub `timerring/codex-pet-naiwa`)**：
   - **单帧网格尺寸（关键参数）**：每一帧严格为 **`宽 192px × 高 208px`**，每行固定 **8 列**（总宽 `1536px`）。
   - `web-spritesheet.png`（尺寸 `1536 × 1872`，共 9 行）与 `spritesheet.webp`（尺寸 `1536 × 2288`，共 11 行）行号映射表（0-indexed）：
     | 行号 (Row) | 起始 Y 坐标 (`row * 208`) | 动作键名 (`state`) | 有效帧数 (`frames`) | 画面内容描述 | 养成网站绑定场景 |
     | :--- | :--- | :--- | :--- | :--- | :--- |
     | **Row 0** | `y = 0` | `idle` | 6 帧 (col 0..5) | 正面站立、呼吸与眨眼 | 默认待机状态 |
     | **Row 1** | `y = 208` | `running-right` | 8 帧 (col 0..7) | 迈开蛙脚向右奔跑 | 《接食物小游戏》向右移动 / 运动减肥 |
     | **Row 2** | `y = 416` | `running-left` | 8 帧 (col 0..7) | 迈开蛙脚向左奔跑 | 《接食物小游戏》向左移动 / 运动减肥 |
     | **Row 3** | `y = 624` | `waving` | 4 帧 (col 0..3) | 举起右手开心招手 | 登录欢迎、AI 回复完成、好友来访 |
     | **Row 4** | `y = 832` | `jumping` | 5 帧 (col 0..4) | 双手捧大白肚皮仰头爆笑弹跳 | 戳肚皮互动、投喂美食、小游戏得分 |
     | **Row 5** | `y = 1040` | `failed` | 8 帧 (col 0..7) | 低头丧气、蹲下委屈抱肚 | 饱腹度/心情过低（饥饿/难过）、游戏失败 |
     | **Row 6** | `y = 1248` | `review` | 6 帧 (col 0..5) | 双手合十期待、摊手展示 | 换装预览、获得奖励、商城购买成功 |
     | **Row 7** | `y = 1456` | `thinking` | 6 帧 (col 0..5) | 右手托腮认真思考 | 等待 AI 聊天回复中、打工进行中 |
     | **Row 8** | `y = 1664` | `waiting` | 6 帧 (col 0..5) | 抱臂、拍肚皮、叉腰等待 | 长时间无操作提示、催促投喂 |
     | **Row 9~10** | `y = 1872, 2080` | `look` (仅 `.webp`) | 16 帧 (2行×8列) | 16 个方向的头部与眼神朝向 | 鼠标在屏幕移动时的 16 向注视跟随 |

---

## 2. 目标工程目录结构 (Project Directory Tree)

AI Agent 在开发时，必须在 `C:\Users\HP\.gemini\antigravity\scratch\nailong-pet` 下构建如下标准目录结构：

```text
nailong-pet/
├── package.json                  # Node.js 依赖与启动脚本配置
├── server.js                     # Express 全栈主服务端入口（含 API 路由、静态资源映射、AI 网关）
├── db.js                         # SQLite 数据库初始化、表结构迁移与 DAO 封装
├── .env.example                  # 环境变量模板（端口、JWT 密钥、Azure/DeepSeek/Gemini API 配置）
├── .gitignore                    # Git 忽略规则（忽略 node_modules, data/*.db, .env 及临时解压冗余目录）
├── Dockerfile                    # 容器化部署文件（支持 Azure Web App for Containers 或 Azure VM）
├── .github/
│   └── workflows/
│       └── azure-deploy.yml      # GitHub Actions 自动部署到 Azure App Service 工作流
├── data/                         # 运行时自动创建的持久化目录（存放 nailong.db SQLite 文件）
├── naiwa-assets/                 # [已存在] 桌面 素材.nwp 解压的高清帧，由 Express 挂载至 /assets/nwp
├── codex-pet-naiwa-repo/         # [已存在] GitHub 精灵表仓库，由 Express 挂载至 /assets/codex
└── public/                       # 前端静态资源根目录
    ├── index.html                # 单页应用 (SPA) 主页面（含养成主舞台、商城、AI聊天、排行榜、小游戏弹窗）
    ├── css/
    │   └── style.css             # 自定义果冻弹性动画、毛玻璃 UI、暗黑/睡眠模式与响应式样式
    └── js/
        ├── app.js                # 前端核心状态机、鉴权管理、API 通信、UI 绑定与定时轮询
        ├── pet2d.js              # 2D 奶蛙双源渲染引擎（Canvas 精灵表切片 + NWP 422帧高清狂笑 + 装扮叠加 + 粒子特效）
        ├── pet3d.js              # 3D 奶蛙 Three.js 引擎（程序化梨形奶蛙建模 + 弹簧肚皮物理 + Raycaster 点击 + 3D 装扮）
        └── minigames.js          # 内置小游戏引擎（《奶蛙接食物大作战》与《狂戳大肚皮》+ 预留《打工挂机》接口）
```

---

## 3. 数据库设计 (SQLite Schema — `db.js`)

使用 `better-sqlite3`（或内置轻量级兼容存储封装，推荐 `better-sqlite3` 配合原生 JSON 持久化防崩机制，确保在 Windows 本地开发与 Linux Azure 环境均无需编译报错即可运行）。数据库文件保存在 `./data/naiwa.db`。

### 3.1 数据表结构定义

#### 表 1：`users` (用户账号表)
```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 表 2：`pets` (奶蛙宠物状态与养成数据表，与 `users` 1对1关联)
```sql
CREATE TABLE IF NOT EXISTS pets (
  user_id INTEGER PRIMARY KEY,
  pet_name TEXT DEFAULT '小奶蛙',
  level INTEGER DEFAULT 1,
  exp INTEGER DEFAULT 0,
  coins INTEGER DEFAULT 200,          -- 初始赠送 200 奶蛙币
  hunger INTEGER DEFAULT 80,          -- 饱腹度 (0~100)
  mood INTEGER DEFAULT 85,            -- 心情值 (0~100)
  cleanliness INTEGER DEFAULT 90,     -- 清洁度 (0~100)
  energy INTEGER DEFAULT 90,          -- 精力值 (0~100)
  weight REAL DEFAULT 20.0,           -- 体重 (kg，默认 20.0kg，喂食增加、运动减少，影响肚皮视觉缩放比例)
  is_sleeping INTEGER DEFAULT 0,      -- 是否在睡觉 (0 或 1)
  equipped_hat TEXT DEFAULT 'none',   -- 当前头饰 ('none', 'crown', 'bamboo_copter', 'frog_hood')
  equipped_acc TEXT DEFAULT 'none',   -- 当前面部/颈部配饰 ('none', 'sunglasses', 'bowtie', 'bib')
  room_theme TEXT DEFAULT 'warm',     -- 房间背景主题 ('warm', 'meadow', 'night_market')
  inventory_json TEXT DEFAULT '{"skewers":2,"salad":1}', -- JSON 字符串：存储拥有的食物与已解锁装扮列表
  work_status_json TEXT DEFAULT '{"isWorking":false,"endTime":0,"reward":0}', -- 预留给选项4《打工挂机系统》
  likes_count INTEGER DEFAULT 0,      -- 被其他玩家“戳肚皮点赞”的累计次数
  last_updated INTEGER NOT NULL,      -- 上次状态结算的 Unix 时间戳 (ms)，用于计算离线自然衰减
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### 表 3：`guestbook` (好友串门留言板表)
```sql
CREATE TABLE IF NOT EXISTS guestbook (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_user_id INTEGER NOT NULL,    -- 被留言的房间主人 user_id
  author_user_id INTEGER NOT NULL,    -- 留言者 user_id
  author_nickname TEXT NOT NULL,
  content TEXT NOT NULL,
  action_type TEXT DEFAULT 'message', -- 'message' (留言), 'poke' (戳肚皮点赞), 'gift_food' (投喂零食)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 表 4：`chat_logs` (AI 奶蛙对话历史表)
```sql
CREATE TABLE IF NOT EXISTS chat_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL,                 -- 'user' 或 'assistant'
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 状态随时间自然衰减算法（离线结算）
每次调用 `GET /api/pet` 获取宠物状态时，后端根据 `Date.now() - pet.last_updated` 计算经过的分钟数 `elapsedMinutes`：
- 若 `is_sleeping === 1`（睡眠中）：
  - `energy` 每 5 分钟恢复 `+4`（上限 100）；
  - `hunger` 每 15 分钟缓慢下降 `-1`（下限 10）。
- 若 `is_sleeping === 0`（清醒中）：
  - `hunger` 每 10 分钟下降 `-2`；
  - `mood` 每 12 分钟下降 `-2`；
  - `cleanliness` 每 20 分钟下降 `-1`；
  - `energy` 每 15 分钟下降 `-1`。
- 结算后更新 `last_updated = Date.now()`。
- **开箱即用种子数据（Seed Data）**：数据库首次初始化时，自动创建 3 个演示 NPC 玩家（如“小七”、“暴暴龙”、“烤串摊主”），带有不同体重、等级和装扮的奶蛙，确保新用户注册后打开“排行榜”和“好友串门”立刻有丰富内容可交互。

---

## 4. 后端 API 接口契约 (`server.js`)

后端基于 Express 构建，监听 `process.env.PORT || 3000`。

### 4.1 静态资源映射
```javascript
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets/nwp', express.static(path.join(__dirname, 'naiwa-assets')));
app.use('/assets/codex', express.static(path.join(__dirname, 'codex-pet-naiwa-repo/codex-pet-naiwa-main/naifrog')));
```

### 4.2 商城商品静态配置字典 (`SHOP_CATALOG`)
后端与前端共享以下商品配置：
- **食物类 (`type: 'food'`)**：
  - `skewers`（秘制烤羊肉串）：价格 `25` 币，饱腹 `+22`，心情 `+15`，体重 `+0.8 kg`，经验 `+15`。
  - `drumstick`（黄金脆皮鸡腿）：价格 `35` 币，饱腹 `+30`，心情 `+20`，体重 `+1.2 kg`，经验 `+20`。
  - `milktea`（珍珠大桶奶茶）：价格 `20` 币，饱腹 `+12`，心情 `+25`，体重 `+0.6 kg`，经验 `+12`。
  - `salad`（轻体减脂蔬菜沙拉）：价格 `30` 币，饱腹 `+15`，心情 `-2`（吃草微委屈），**体重 `-1.5 kg`**（减肥利器！），经验 `+20`。
  - `chili`（喷火魔鬼椒）：价格 `40` 币，饱腹 `+10`，心情 `+30`，触发专属**喷火特效**，经验 `+25`。
- **装扮类 (`type: 'cosmetic'`，一次购买永久拥有)**：
  - 头饰 (`slot: 'hat'`)：
    - `crown`（大肚王金皇冠）：价格 `150` 币
    - `bamboo_copter`（飞天竹蜻蜓）：价格 `120` 币
    - `chef_hat`（烤串大厨帽）：价格 `100` 币
  - 配饰 (`slot: 'acc'`)：
    - `sunglasses`（墨镜大佬）：价格 `100` 币
    - `bowtie`（绅士红领结）：价格 `80` 币
    - `bib`（干饭人小围兜）：价格 `60` 币
  - 房间主题 (`slot: 'theme'`)：
    - `warm`（温馨小窝，默认免费）
    - `meadow`（青青蛙草地）：价格 `180` 币
    - `night_market`（深夜烧烤摊）：价格 `220` 币

### 4.3 RESTful API 路由清单
1. **`POST /api/auth/register`**
   - Body: `{ username, password, nickname, petName }`
   - 逻辑：创建用户与初始奶蛙记录，返回 `{ token, user, pet }`。
2. **`POST /api/auth/login`**
   - Body: `{ username, password }`
   - 逻辑：校验密码，返回 `{ token, user, pet }`。
3. **`GET /api/pet`** (需 Bearer Token，或支持游客自动分配临时账号体验)
   - 逻辑：执行自然衰减结算，返回当前用户的 `{ pet, user, shopCatalog }`。
4. **`POST /api/pet/action`**
   - Body: `{ action, itemId }`
   - 支持的 `action` 类型：
     - `'poke'`（戳大白肚皮）：心情 `+8`，精力 `-2`，经验 `+5`，随机掉落 `1~5` 枚金币，返回 `{ animation: 'laugh', speech: '哈哈哈别挠我大肚肚，好痒呀！' }`。
     - `'feed'`（投喂背包里的食物 `itemId`）：扣除背包数量，按字典增加饱腹/心情/体重/经验。
     - `'exercise'`（跳操减肥）：精力 `-15`，饱腹 `-10`，**体重 `-1.2 kg`**，心情 `+5`，经验 `+20`。
     - `'clean'`（搓澡擦肚皮）：清洁度设为 `100`，心情 `+10`，经验 `+10`。
     - `'toggle_sleep'`（开关灯睡觉）：切换 `is_sleeping` 状态。
     - `'rename'`（改名）：修改 `pet_name`。
   - 等级升级公式：当 `exp >= level * 100` 时，`exp -= level * 100`，`level += 1`，奖励 `coins += 50`。
5. **`POST /api/shop/buy`**
   - Body: `{ itemId }`
   - 逻辑：扣除金币，食物数量 `+1` 或解锁装扮到 `inventory_json`。
6. **`POST /api/pet/equip`**
   - Body: `{ slot, itemId }` (`slot` 为 `'hat' | 'acc' | 'theme'`)
   - 逻辑：穿戴或卸下已解锁的装扮。
7. **`POST /api/minigame/reward`**
   - Body: `{ gameType, score }` (`gameType` 为 `'catch_food' | 'poke_belly'`)
   - 逻辑：根据小游戏得分发放金币（单局上限 120 金币防刷）与经验值，同时消耗少量精力 `-5`。
8. **`POST /api/chat`** (AI 聊天网关接口)
   - Body: `{ message, providerConfig }`（支持前端传入临时测试 Key，或读取服务端环境变量）
   - 逻辑：见第 7 节“多模型 AI 聊天网关实现规范”。
9. **`GET /api/social/leaderboard`**
   - 逻辑：返回三个榜单的前 10 名：`weightList`（大肚王/最重奶蛙榜）、`levelList`（最高等级榜）、`likesList`（人气奶蛙榜）。
10. **`GET /api/social/visit/:userId`**
    - 逻辑：获取目标玩家的奶蛙公开状态、装扮及最近 20 条留言板记录。
11. **`POST /api/social/interact`**
    - Body: `{ targetUserId, type, content }`
    - 支持 `type`：
      - `'poke'`（戳好友奶蛙肚皮点赞）：目标奶蛙 `likes_count + 1`、心情 `+5`，访问者奖励 `+5` 金币。
      - `'gift_food'`（花费 15 金币投喂好友奶蛙烤串）：目标奶蛙饱腹 `+15`、体重 `+0.5kg`，自动生成一条投喂动态。
      - `'message'`（发表留言）：写入 `guestbook` 表。

---

## 5. 前端 2D 奶蛙渲染引擎详细规范 (`public/js/pet2d.js`)

2D 渲染引擎必须充分利用现有的两套原生高清素材，在一个 `<canvas id="pet2d-canvas" width="380" height="420">` 上进行合成绘制：

### 5.1 双素材源智能调度机制
1. **精灵表动画模式 (`web-spritesheet.png` / `spritesheet.webp`)**：
   - 预加载 `/assets/codex/web-spritesheet.png`（以及支持 WebP 时的 `/assets/codex/spritesheet.webp`）。
   - 给定当前动作 `state`（如 `idle`, `running-left`, `running-right`, `waving`, `jumping`, `failed`, `review`, `thinking`, `waiting`），按照 **1.2 节的映射表** 查找对应的 `row` 和 `frameCount`。
   - 在 `requestAnimationFrame` 循环中（默认动画帧率 `8 ~ 10 FPS`），计算切片坐标：
     ```javascript
     const sx = currentFrame * 192;
     const sy = rowConfig.row * 208;
     ctx.drawImage(spritesheetImg, sx, sy, 192, 208, drawX, drawY, drawWidth, drawHeight);
     ```
2. **NWP 高清狂笑与视线跟随模式 (`/assets/nwp/`)**：
   - **鼠标视线跟随**：当处于 `idle` 状态且鼠标在画布周围移动时，计算鼠标相对奶蛙中心的水平归一化偏移 `ratio` (`0.0 ~ 1.0`)，映射为 `00` ~ `10` 的索引，直接渲染 `/assets/nwp/look/${idx}.png`（或者使用 `spritesheet.webp` 第 9~10 行的 16 方向帧）！
   - **高清捧腹狂笑 (`laugh`)**：当用户点击“狂笑/戳肚皮”时，按 `30 FPS` 流畅播放 `/assets/nwp/laugh/0000.png` 至 `0180.png`（采取分段按需预加载与缓存机制，避免一次性发起 422 个请求阻塞网络，前 90 帧核心狂笑动作丝滑秒播）。
3. **体重对肚皮的视觉影响 + 果冻物理缩放 (Squash & Stretch)**：
   - 根据 `pet.weight`（基准 `20kg`），动态计算水平胖瘦缩放因子 `fatScaleX = clamp(1 + (weight - 20) * 0.008, 0.88, 1.35)`，体重越重，奶蛙横向看起来越圆润庞大！
   - 点击奶蛙时触发弹簧谐振器：`scaleX = 1 + 0.18 * Math.sin(t) * Math.exp(-damping * t)`，`scaleY = 1 - 0.14 * Math.sin(t) * Math.exp(-damping * t)`，呈现“duang duang”果冻弹性。
4. **2D 装扮与特效叠加层**：
   - 在奶蛙头顶锚点 `(headX, headY)` 和眼部/颈部锚点自动绘制矢量装扮（金皇冠、旋转竹蜻蜓动画、酷炫墨镜、红领结、干饭小围兜）。
   - 内置粒子发射器：喂食时飘起美味音符与烤串图标、戳肚皮飘起彩色笑脸与爱心、吃魔鬼椒喷出动态火焰粒子、睡觉时冒出鼻涕泡与 `Zzz`。

---

## 6. 前端 3D 奶蛙 Three.js 引擎详细规范 (`public/js/pet3d.js`)

当用户点击顶部 **`[ 3D 立体奶蛙 ]`** 按钮时，无缝切换到 Three.js WebGL 渲染视图：

### 6.1 1:1 奶蛙程序化几何建模参数
为了精准还原 `素材.nwp` 中的奶蛙（而非普通恐龙），使用 Three.js 组合构建带有层次感与柔光卡通质感（`MeshToonMaterial` / `MeshStandardMaterial` 配合环境光与轮廓高光）的 3D 奶蛙模型组 `naiwaGroup`：
1. **梨形连体黄身 (`bodyMesh` + `neckHeadMesh`)**：
   - 主材质颜色：明黄色 `#FFD43B`（roughness `0.55`, metalness `0.05`）。
   - 下半身大肚子球体：`SphereGeometry(1.35, 32, 32)`，位置 `(0, -0.3, 0)`，缩放 `(1.05 * fatScale, 1.1, 1.02 * fatScale)`。
   - 上半身与圆脑袋平滑过渡：通过中段圆台/球体 `(0, 0.55, -0.05)` 与头顶圆球 `SphereGeometry(0.82, 32, 32)` 在 `(0, 1.25, -0.05)` 处无缝衔接，形成“无明显脖子分界”的经典奶蛙保龄球瓶轮廓。
2. **标志性奶油白大肚皮 (`bellyMesh`)**：
   - 材质颜色：奶油米白色 `#F7E8C8`（roughness `0.6`）。
   - 几何体：`SphereGeometry(1.12, 32, 32)`，位置 `(0, -0.22, 0.42)`，缩放 `(0.95 * fatScale, 1.02, 0.65)`，贴合在黄色躯干正前方，并赋名 `bellyMesh.name = 'belly'` 供 Raycaster 点击检测。
3. **翠绿凸起大蛙眼 (`leftEyeGroup`, `rightEyeGroup`)**：
   - 翠绿眼眶/虹膜球：`SphereGeometry(0.21, 24, 24)`，颜色 `#7BC678`，位于头部两侧偏前 `(±0.42, 1.42, 0.62)`。
   - 黑色大瞳孔：`SphereGeometry(0.13, 20, 20)`，颜色 `#111111`，位于 `(±0.44, 1.42, 0.74)`，带白色高光小点 `#FFFFFF`。
   - 仰头大笑状态时，自动隐藏圆眼球并显示弯月形笑眼弧线！
4. **嘴巴与仰头大笑口腔 (`mouthGroup`)**：
   - 待机状态：一条呆萌的浅棕色微笑抿嘴弧线。
   - 大笑状态（点击肚皮或投喂时）：头部后仰 `rotation.x = -0.45 rad`，张开深色大嘴内腔，露出上下两排洁白牙齿！
5. **灵魂特征：棕褐色渐变捧肚双手 (`leftArmGroup`, `rightArmGroup`)**：
   - 大臂与小臂为明黄色胶囊体，自然弯曲环抱在白肚皮左右两侧；
   - **手掌部分 (`handMesh`)**：颜色为标志性的深灰褐色 `#6E5A3E`，带有 4 根短小圆润的手指，紧贴在奶油白肚皮表面！大笑时双手以 `20Hz` 频率上下拍打白肚皮。
6. **三趾棕褐色蛙蹼脚 (`leftFootGroup`, `rightFootGroup`) 与小尾巴 (`tailMesh`)**：
   - 双腿短粗（黄色），脚掌为宽平的三趾蛙蹼结构，颜色为深棕褐色 `#6E5A3E`；
   - 屁股后方带一条短小圆润的黄色小尾巴 `(0, -0.9, -1.25)`。
7. **3D 交互与外部 GLB 扩展**：
   - 集成 `OrbitControls` 支持鼠标左键 360° 旋转、滚轮缩放。
   - 集成 `THREE.Raycaster`：点击 `belly` 区域时，白肚皮产生真实的弹簧膨胀形变并触发 3D 奶蛙仰头拍肚狂笑；鼠标移动时 3D 蛙眼实时朝向鼠标位置。
   - 预留 `loadCustomGLB('/assets/custom_naiwa.glb')` 方法，若检测到用户放入了自定义 `.glb` 文件则自动加载替换。

---

## 7. 多模型 AI 聊天网关实现规范 (`server.js`)

后端 `/api/chat` 接口提供统一的多模型适配层，按以下优先级自动选择或由前端在“AI 设置”面板中随时切换：

1. **奶蛙专属 System Prompt**：
   > “你是主人的电子宠物‘奶蛙（Naiwa）’——一只圆滚滚、明黄色皮肤、有着超大奶油白肚皮和棕褐色小手小脚的可爱蛙蛙/幼龙。你的性格乐观呆萌、是个资深小吃货（最爱吃烤羊肉串、脆皮鸡腿和奶茶，天天喊减肥但管不住嘴），最喜欢双手捧着自己的大白肚皮仰头哈哈大笑。说话要简短俏皮（每次回复控制在 60 字以内），经常使用‘呱哈哈~’、‘duang duang~’等语气词，多关心主人的心情。”
2. **支持的三大云端 Provider**：
   - **Azure OpenAI**：读取 `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`（优先使用用户的 1300 元 Azure 额度）。
   - **DeepSeek API**：读取 `DEEPSEEK_API_KEY`，调用 `https://api.deepseek.com/chat/completions` (`model: 'deepseek-chat'`)。
   - **Google Gemini API**：读取 `GEMINI_API_KEY`，调用 `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`。
3. **高拟真智能离线兜底引擎 (Fallback Engine)**：
   - 当环境变量和前端均未配置 API Key，或网络请求失败时，自动根据用户输入关键词（如“饿/吃/烤串”、“胖/减肥/肚子”、“累/工作/难过”、“笑/开心/好玩”、日常问候等）结合奶蛙当前真实的 `hunger`、`weight`、`mood` 数值生成高度拟人化的回应，确保零配置下也能畅快对话。

---

## 8. 内置小游戏实现规范 (`public/js/minigames.js`)

### 8.1 游戏一：《奶蛙接食物大作战》 (Catch Food Game)
- **画布尺寸**：`480 × 360`，限时 `30 秒`。
- **角色控制**：底部是一只使用 `web-spritesheet.png` 第 1 行 (`running-right`) 和第 2 行 (`running-left`) 原版奔跑动画的奶蛙，支持键盘 `← / →`、`A / D` 或鼠标/触屏滑动控制。
- **掉落物逻辑**：
  - 烤串 (`+10` 分)、鸡腿 (`+15` 分)、奶茶 (`+12` 分)：接到时奶蛙短暂切换为 `jumping` 捧腹笑帧。
  - 炸弹 (`-20` 分并震屏)、大哑铃 (`-10` 分)：接到时切换为 `failed` 委屈帧。
- **结算**：游戏结束将分数发送至 `POST /api/minigame/reward`，按 `Math.min(120, Math.floor(score * 0.6))` 转化并发放奶蛙币。

### 8.2 游戏二：《狂戳大肚皮》 (Belly Poke Mania)
- **玩法**：限时 `12 秒` 手速狂点挑战。画面中央展示高清奶蛙大白肚皮，每次点击触发果冻波纹、连击 Combo 计数、浮动 `+金币` 文字，并实时加速播放奶蛙仰头爆笑动画。
- **狂暴状态 (Fever Mode)**：当点击频率超过每秒 5 次时，背景进入彩虹狂欢特效，每次点击收益翻倍！

### 8.3 预留模块：《奶蛙打工挂机系统》 (Work Idle Stub)
- 在 UI 和数据库中预留“派奶蛙去夜市烤串摊打工”入口，包含状态字段 `work_status_json`，方便后续随时启用。

---

## 9. GitHub 与 Azure 部署配置规范

### 9.1 `Dockerfile`
编写标准 Node 20 Alpine 镜像配置，暴露 `3000` 端口（兼容 Azure App Service 默认注入的 `PORT` 环境变量），挂载 `/app/data` 持久化卷。

### 9.2 `.github/workflows/azure-deploy.yml`
提供标准的 GitHub Actions 自动构建与发布至 Azure Web App 工作流配置，并在 README 中附带保姆级 Azure 1300 元额度创建 Web App / 虚拟机的图文步骤说明。

---

## 10. AI Agent 开发自检清单 (Verification Checklist)
1. [ ] 运行 `npm install` 安装 `express`, `cors`, `jsonwebtoken`, `bcryptjs` 等依赖无报错。
2. [ ] 启动 `node server.js` 后，访问 `http://localhost:3000` 页面正常渲染。
3. [ ] 2D 模式下 `/assets/codex/web-spritesheet.png` 的 9 种动作及 `/assets/nwp/` 的视线跟随、捧腹狂笑正常加载显示，无裂图。
4. [ ] 切换到 3D 模式后，Three.js 正确渲染出黄身、白肚、棕手脚、绿眼睛的 3D 奶蛙，支持拖拽旋转与点击肚皮大笑。
5. [ ] 喂食、运动减肥、清洁、睡觉、商城买装扮穿戴、两款小游戏结算、AI 聊天、排行榜与好友串门留言全部闭环可用。
