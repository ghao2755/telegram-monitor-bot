// 加载环境变量
require('dotenv').config();

// 导入必要的模块
const { Telegraf } = require('telegraf');
const fs = require('fs-extra');
const path = require('path');

// 检查必要的目录是否存在
const ensureDirectories = async () => {
  try {
    // 确保数据目录存在
    await fs.ensureDir(path.join(__dirname, 'data'));
    // 确保src目录存在
    await fs.ensureDir(path.join(__dirname, 'src'));
    // 确保scripts目录存在
    await fs.ensureDir(path.join(__dirname, 'scripts'));
    
    console.log('所有必要的目录已创建');
  } catch (error) {
    console.error('创建目录时出错:', error);
    process.exit(1);
  }
};

// 初始化机器人
const initBot = async () => {
  try {
    // 检查必要的环境变量
    if (!process.env.BOT_TOKEN) {
      console.error('错误: 请在.env文件中设置BOT_TOKEN');
      process.exit(1);
    }

    // 创建机器人实例
    const bot = new Telegraf(process.env.BOT_TOKEN);

    // 加载核心模块
    const botModule = require('./src/bot');
    const handlers = require('./src/handlers');
    const database = require('./src/database');

    // 初始化数据库
    await database.init();

    // 初始化机器人核心功能
    botModule.init(bot, database, handlers);

    // 启动机器人
    bot.launch().then(() => {
      console.log('机器人已成功启动');
      console.log(`管理员ID: ${process.env.ADMIN_IDS || '未设置'}`);
      console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
    });

    // 优雅退出处理
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

  } catch (error) {
    console.error('初始化机器人时出错:', error);
    process.exit(1);
  }
};

// 主函数
const main = async () => {
  console.log('开始初始化Telegram监控机器人...');
  await ensureDirectories();
  await initBot();
};

// 启动应用
main();