# Telegram Message Forwarder Bot

一个使用 Node.js 和 Telegraf 框架开发的 Telegram 消息转发机器人，支持多群组监听和文本替换功能。

## 功能特点

- 📢 同时监听多个源群组的消息
- 📤 自动转发消息到多个目标群组
- 🔄 对文本消息进行自定义规则的替换
- 📁 支持从外部 JSON 文件加载替换规则
- 🖼️ 支持文本、图片、音频、视频等多种消息类型
- 🚫 自动忽略机器人自己发送的消息，避免循环转发
- 🛠️ 简单易用的配置方式

## 安装说明

### 前提条件

- Node.js v12+ 和 npm 已安装
- 一个 Telegram Bot Token（通过 [@BotFather](https://t.me/BotFather) 获取）

### 安装步骤

1. 克隆或下载此项目

2. 安装依赖

```bash
npm install
```

3. 创建环境变量文件

复制 `.env.example` 文件并重命名为 `.env`，然后填入必要的环境变量：

```bash
cp .env.example .env
# 编辑 .env 文件，填入所需的环境变量
```

4. 配置文本替换规则（可选）

编辑 `src/replacementRules.json` 文件，添加你需要的文本替换规则：

```json
{
  "旧词1": "新词1",
  "旧词2": "新词2",
  "...": "..."
}
```

5. 启动机器人

```bash
# 生产环境启动
npm start

# 开发环境启动（使用 nodemon 自动重启）
npm run dev
```

## 使用指南

### 基本命令

- `/start` - 显示欢迎消息和当前配置状态
- `/help` - 显示帮助信息

### 获取聊天/频道ID

要获取聊天或频道的ID，可以向机器人发送消息，然后在日志中查看消息的 `chat.id` 字段。

### 注意事项

- 确保机器人已加入所有源群组和目标群组
- 确保机器人在源群组中有读取消息的权限
- 确保机器人在目标群组中有发送消息的权限
- 对于私有频道，可能需要设置频道权限以允许机器人查看消息

## 配置选项

在 `.env` 文件中可以设置以下环境变量：

- `BOT_TOKEN` - Telegram Bot Token（必填）
- `SOURCE_CHAT_IDS` - 源群组ID列表，多个ID用逗号分隔（必填）
- `TARGET_CHAT_IDS` - 目标群组ID列表，多个ID用逗号分隔（必填）
- `ADMIN_ID` - 管理员ID（可选）
- `DEBUG_MODE` - 是否启用调试模式（可选，设置为 `true` 启用）

如果只需要配置单个源群组或目标群组，也可以使用以下环境变量：

- `SOURCE_CHAT_ID` - 单个源群组ID（与 `SOURCE_CHAT_IDS` 二选一）
- `TARGET_CHAT_ID` - 单个目标群组ID（与 `TARGET_CHAT_IDS` 二选一）

## 项目结构

- `src/index.js` - 主入口文件和机器人逻辑
- `src/config.js` - 配置文件，处理环境变量和外部配置加载
- `src/replacementRules.json` - 文本替换规则的JSON配置文件
- `.env.example` - 环境变量示例
- `.env` - 环境变量配置文件（不提交到代码仓库）
- `package.json` - 项目配置和依赖
- `ecosystem.config.js` - PM2 进程管理配置文件
- `Dockerfile` - Docker 容器化配置文件

## 部署方式

### 1. 直接运行

```bash
npm install
npm start
```

### 2. 使用 PM2 进程管理

```bash
# 安装 PM2（如果尚未安装）
npm install -g pm2

# 使用 PM2 启动机器人
pm run pm2:start

# 查看 PM2 状态
pm run pm2:status

# 停止 PM2 管理的机器人
npm run pm2:stop

# 查看日志
npm run pm2:logs
```

### 3. 使用 Docker 容器化部署

```bash
# 构建 Docker 镜像
docker build -t telegram-forwarder-bot .

# 运行 Docker 容器
docker run -d --name telegram-bot --env-file .env telegram-forwarder-bot

# 查看容器日志
docker logs -f telegram-bot

# 停止容器
docker stop telegram-bot
```

## 依赖说明

- [telegraf](https://github.com/telegraf/telegraf) - Telegram Bot 开发框架
- [dotenv](https://github.com/motdotla/dotenv) - 环境变量管理
- [node-cron](https://github.com/node-cron/node-cron) - 定时任务管理
- [nodemon](https://github.com/remy/nodemon) - 开发环境自动重启工具（仅开发依赖）

## License

ISC