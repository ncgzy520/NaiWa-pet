# 奶蛙 (Naiwa / Naifrog) 云端桌面宠物乐园 🐸

全网爆火的呆萌 AI 萌宠“**奶蛙 (Naiwa / Naifrog)**”全栈云端养成与轻社交网站！拥有圆滚滚的黄色身体、超大奶油白肚皮、棕褐色手脚与翠绿大蛙眼。
支持 **2D 原版序列帧素材** 与 **3D 程序化建模** 一键切换、养成互动、小游戏赚金币、装扮商城、多模型 AI 聊天（Azure OpenAI / DeepSeek / Gemini + 离线兜底）、全服大肚王排行榜与好友串门留言！

---

## 🌟 核心特性

1. **2D + 3D 双模式一键无缝切换**：
   - **2D 模式**：内置原生透明序列帧（待机、左右奔跑、招手、托腮思考、等待、委屈）及高清 **仰头拍肚皮狂笑** 动画，支持鼠标移动时 16 方向眼神跟随与点击果冻弹性形变。
   - **3D 模式**：基于 **Three.js** 1:1 程序化构建立体奶蛙（黄身、大白肚皮、棕褐渐变捧腹小手、三趾蛙脚、凸起绿眼），支持 360° 旋转与肚皮弹簧物理回弹！
2. **随体重“真长胖”系统**：
   - 投喂羊肉串、鸡腿或奶茶会增加体重，奶蛙的大白肚皮在视觉上会同步横向变圆变大！
   - 跳操减肥或吃轻体蔬菜沙拉可降低体重。
3. **内置两款赚金币小游戏**：
   - 《奶蛙接食物大作战》：控制奔跑奶蛙接烤串和鸡腿，躲避炸弹。
   - 《狂戳大肚皮手速王》：12 秒极速连击戳肚皮，进入狂暴模式赚翻金币！
4. **多模型 AI 聊天网关**：
   - 统一接口，支持 **Azure OpenAI**（优先消耗你的 1300 元 Azure 额度）、**DeepSeek API**、**Google Gemini API**。
   - 离线免配置兜底：即便不填写任何 Key，内置的高拟真奶蛙语录引擎依然能畅快对话！
5. **轻社交与大肚王排行榜**：
   - 大肚王榜（最重奶蛙）、等级榜、点赞榜。
   - 好友串门：进入好友房间，戳对方奶蛙肚皮点赞、投喂羊肉串，并留下暖心留言！

---

## 🚀 本地运行与体验

确保已安装 [Node.js](https://nodejs.org/)（Node 18+）：

```bash
# 1. 进入项目根目录
cd nailong-pet

# 2. 安装依赖（如果尚未安装）
npm install

# 3. 启动全栈服务器
npm start
```

打开浏览器访问：`http://localhost:3000` 即可开始体验！可以直接点击 **“一键免密快速体验”** 立即领养小奶蛙。

---

## ☁️ 部署到 GitHub 与 Azure (1300 RMB 额度保姆级指南)

### 第一步：上传到 GitHub
1. 打开 [GitHub](https://github.com/) 并创建一个新的公开或私有仓库，例如 `my-naiwa-pet`。
2. 在本地项目根目录下执行：
   ```bash
   git init
   git add .
   git commit -m "feat: initial commit of naiwa pet fullstack website"
   git branch -M main
   git remote add origin https://github.com/你的用户名/my-naiwa-pet.git
   git push -u origin main
   ```

### 第二步：在 Azure 上创建 Web 应用 (App Service)
1. 登录 [Azure 门户 (portal.azure.com)](https://portal.azure.com/)。
2. 在顶部搜索栏输入 **“App Services”**（应用服务），点击 **“创建” -> “Web 应用”**。
3. 填写基本配置：
   - **订阅**：选择你包含 1300 元额度的订阅。
   - **资源组**：新建一个，例如 `rg-naiwa`。
   - **名称**：给网站起一个全球唯一的二级域名，例如 `naiwa-pet-cloud`（最终访问网址为 `https://naiwa-pet-cloud.azurewebsites.net`）。
   - **发布**：选择 **代码 (Code)**。
   - **运行时堆栈 (Runtime stack)**：选择 **Node 20 LTS**。
   - **操作系统**：选择 **Linux**。
   - **定价计划 (Pricing Plan)**：推荐选择 **Basic B1**（约每月 80~90 元人民币，1300 元额度完全足够运行一年以上！）。
4. 点击 **“查看并创建”** -> **“创建”**。

### 第三步：配置 GitHub 自动部署 (GitHub Actions)
1. 部署完成后，进入你创建好的 Web 应用页面。
2. 在左侧菜单点击 **“部署中心 (Deployment Center)”**。
3. 在 **代码源** 中选择 **GitHub**，授权并选中你的 `my-naiwa-pet` 仓库和 `main` 分支。
4. Azure 会自动为你生成 GitHub Actions 工作流，并在你每次 `git push` 到 GitHub 时自动构建上线！
5. 在左侧 **“配置 (Configuration)” -> “应用程序设置”** 中，可添加：
   - `AZURE_OPENAI_ENDPOINT`
   - `AZURE_OPENAI_API_KEY`
   - `AZURE_OPENAI_DEPLOYMENT`

部署完成后，你就可以通过 Azure 提供的专属网址，在手机和电脑上随时随地陪伴你的小奶蛙啦！
"# NaiWa-pet" 
"# NaiWa-pet" 
