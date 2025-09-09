# Telegram 消息转发机器人

一个基于 TypeScript 和 Telegraf.js 的高级 Telegram 消息转发机器人，支持监控多个群组的消息，并自动转发到其他群组，同时提供文本替换和高级配置功能。

## 功能特性

### 核心功能
- **消息监控**：使用可配置的轮询间隔监控指定源群组的新消息
- **消息转发**：支持文本、图片、视频、文档、贴纸等常见消息类型的转发
- **文字替换**：在转发前对消息文本进行查找和替换，支持正则表达式
- **按钮交互界面**：所有配置和管理操作通过与机器人的私聊聊天中的按钮完成

### 高级功能
- **独立置顶设置**：每个目标群组可以独立设置是否置顶转发的消息
- **独立转发规则**：每个目标群组可以独立选择使用哪条转发规则
- **规则管理**：可以创建、编辑、删除多条转发规则，每条规则包含名称和查找替换对
- **群组管理**：通过按钮交互添加/移除源群组和目标群组
- **状态查看**：通过命令查看机器人状态、当前监控的群组、转发关系等

## 技术栈
- **语言**：TypeScript
- **Telegram交互库**：Telegraf.js
- **存储**：SQLite (本地开发) / PostgreSQL (生产环境推荐)
- **ORM**：Prisma
- **任务调度**：node-cron
- **环境管理**：dotenv

## 安装和设置

### 前提条件
- Node.js 18+ 环境
- npm 或 yarn 包管理器
- 一个 Telegram Bot Token (通过 [@BotFather](https://t.me/BotFather) 获取)

### 安装步骤

1. 克隆或下载本项目代码

2. 安装依赖
```bash
npm install
```

3. 配置环境变量
   - 复制 `.env.example` 文件为 `.env`
   - 修改 `.env` 文件中的配置项
     ```
     # Telegram Bot Token
     BOT_TOKEN="7699035106:AAHn-SQPEGsF9sneaAt8cLsAfKa6QZOoNjA"
     
     # SQLite数据库连接
     DATABASE_URL="file:./dev.db"
     
     # 轮询间隔（毫秒）
     POLLING_INTERVAL=5000
     ```

4. 初始化数据库
```bash
npx prisma generate
npx prisma migrate dev --name init
```

5. 构建项目
```bash
npm run build
```

## 使用方法

### 启动机器人
```bash
npm start
```

### 开发模式
```bash
npm run dev
```

### 基本操作
1. 向你的机器人发送 `/start` 命令打开主菜单
2. 使用菜单按钮配置源群组、目标群组和转发规则
3. 机器人会自动监控源群组的新消息并根据配置转发

### 可用命令
- `/start` - 显示主菜单
- `/status` - 查看机器人当前状态
- `/help` - 显示帮助信息

## 项目结构
```
├── src/
│   ├── modules/         # 核心模块
│   ├── services/        # 业务服务
│   ├── utils/           # 工具函数
│   └── index.ts         # 主入口文件
├── prisma/              # Prisma 数据库相关
├── generated/           # 自动生成的代码
├── .env                 # 环境变量配置
├── .gitignore           # Git 忽略文件
├── package.json         # 项目依赖配置
├── tsconfig.json        # TypeScript 配置
└── README.md            # 项目说明文档
```

## 部署指南

### 本地开发环境
按照上面的安装步骤操作即可。

### 生产环境
1. 推荐使用 PostgreSQL 数据库以获得更好的性能和稳定性
2. 更新 `.env` 文件中的 `DATABASE_URL` 为 PostgreSQL 连接字符串
3. 使用 PM2 或其他进程管理工具来管理 Node.js 进程

```bash
# 使用 PM2 启动机器人
npm install -g pm2
pm run build
pm run prod
```

## 注意事项
- 确保您的机器人具有访问您要监控的群组的权限
- 遵守 Telegram API 的使用限制，避免发送过多请求
- 在生产环境中，请确保保护好您的 `.env` 文件和数据库

## 许可证
MIT License

## 贡献
欢迎提交 Issues 和 Pull Requests 来改进这个项目。