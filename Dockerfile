# 使用官方 Node.js 镜像作为基础镜像
FROM node:16-alpine

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm install --production

# 复制源代码
COPY src/ ./src/

# 复制环境变量示例文件（实际环境变量通过 --env-file 或环境变量注入）
COPY .env.example ./

# 创建日志目录
RUN mkdir -p logs

# 暴露端口（虽然 Telegram 机器人不需要公开端口，但这是良好实践）
EXPOSE 3000

# 启动命令
CMD ["npm", "start"]