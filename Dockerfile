# 使用官方轻量 Node.js LTS 镜像
FROM node:20-bookworm-slim

# 安装 build 工具（SQLite 依赖）
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制依赖配置
COPY package*.json ./

# 安装生产依赖
RUN npm ci --only=production

# 复制所有源代码与素材
COPY . .

# 暴露端口（兼容 Azure PORT 环境变量）
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# 启动服务器
CMD ["node", "server.js"]
