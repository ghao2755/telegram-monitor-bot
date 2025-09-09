// 导入必要的模块
const { Markup } = require('telegraf');
const cron = require('node-cron');
const fs = require('fs-extra');
const path = require('path');

// 导入自定义模块
const keyboard = require('./keyboard');
const utils = require('./utils');

// 机器人实例
let bot = null;
let database = null;
let handlers = null;

// 初始化机器人核心功能
const init = (botInstance, dbInstance, handlersInstance) => {
  bot = botInstance;
  database = dbInstance;
  handlers = handlersInstance;

  // 初始化命令
  initCommands();
  
  // 初始化消息处理
  initMessageProcessing();
  
  // 初始化回调处理
  initCallbackHandlers();
  
  // 初始化定时任务
  initCronJobs();
};

// 初始化命令
const initCommands = () => {
  // 开始命令 - 显示主菜单
  bot.command('start', async (ctx) => {
    // 检查用户是否为管理员
    const isAdmin = await utils.isAdmin(ctx.from.id);
    if (!isAdmin) {
      return ctx.reply('抱歉，只有管理员可以使用此机器人。');
    }

    // 记录用户会话
    await utils.setUserSession(ctx.from.id, { currentMenu: 'main' });
    
    // 发送主菜单
    await ctx.reply('欢迎使用Telegram监控机器人控制面板', 
      Markup.inlineKeyboard(keyboard.getMainKeyboard()));
  });

  // 帮助命令
  bot.command('help', async (ctx) => {
    const isAdmin = await utils.isAdmin(ctx.from.id);
    if (!isAdmin) {
      return ctx.reply('抱歉，只有管理员可以使用此机器人。');
    }

    const helpText = `Telegram监控机器人帮助\n\n` +
      `/start - 打开控制面板\n` +
      `/help - 查看帮助信息\n` +
      `/status - 查看系统状态\n` +
      `/ping - 测试机器人响应`;
    
    await ctx.reply(helpText);
  });

  // 状态命令
  bot.command('status', async (ctx) => {
    const isAdmin = await utils.isAdmin(ctx.from.id);
    if (!isAdmin) {
      return ctx.reply('抱歉，只有管理员可以使用此机器人。');
    }

    const status = await getSystemStatus();
    await ctx.reply(status);
  });

  // Ping命令
  bot.command('ping', async (ctx) => {
    const isAdmin = await utils.isAdmin(ctx.from.id);
    if (!isAdmin) {
      return ctx.reply('抱歉，只有管理员可以使用此机器人。');
    }

    await ctx.reply('Pong! 机器人运行正常。');
  });
};

// 初始化消息处理
const initMessageProcessing = () => {
  // 监听所有文本消息
  bot.on('text', async (ctx) => {
    const isAdmin = await utils.isAdmin(ctx.from.id);
    if (!isAdmin) {
      return;
    }

    // 获取用户会话
    const session = await utils.getUserSession(ctx.from.id);
    
    // 如果用户正在进行多步操作，交给场景处理
    if (session && session.currentScene) {
      return handlers.handleSceneInput(ctx, session);
    }
  });

  // 监听其他类型的消息（图片、文档等）
  bot.on(['photo', 'document', 'audio', 'video', 'sticker'], async (ctx) => {
    const isAdmin = await utils.isAdmin(ctx.from.id);
    if (!isAdmin) {
      return;
    }

    // 对于非文本消息，可以根据需要处理
    await ctx.reply('收到非文本消息，但当前版本暂不支持处理。');
  });
};

// 初始化回调处理
const initCallbackHandlers = () => {
  // 菜单导航回调
  bot.action(/^menu:([a-z]+)$/, async (ctx) => {
    const menuType = ctx.match[1];
    await handlers.handleMenuNavigation(ctx, menuType);
  });

  // 操作回调
  bot.action(/^action:([a-z]+):(.+)$/, async (ctx) => {
    const actionType = ctx.match[1];
    const actionParams = ctx.match[2];
    await handlers.handleAction(ctx, actionType, actionParams);
  });

  // 返回按钮回调
  bot.action('back', async (ctx) => {
    await handlers.handleBack(ctx);
  });
};

// 初始化定时任务
const initCronJobs = () => {
  // 获取系统设置
  const settings = database.getSettings();
  
  // 根据设置的检查间隔创建定时任务
  const interval = settings.checkInterval || 300000; // 默认5分钟
  const cronExpression = `*/${interval / 60000} * * * *`; // 转换为分钟

  // 定时检查群组状态和处理消息
  cron.schedule(cronExpression, async () => {
    try {
      console.log('执行定时检查...');
      await checkGroupsStatus();
      
      // 更新最后检查时间
      database.updateLastCheckTime();
    } catch (error) {
      console.error('定时任务执行失败:', error);
      
      // 通知管理员
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      for (const adminId of adminIds) {
        try {
          await bot.telegram.sendMessage(adminId, `⚠️ 定时任务执行失败: ${error.message}`);
        } catch (err) {
          console.error(`通知管理员失败: ${err.message}`);
        }
      }
    }
  });

  console.log(`定时任务已设置，每 ${interval / 60000} 分钟执行一次`);
};

// 检查群组状态
const checkGroupsStatus = async () => {
  const groups = database.getGroups();
  
  for (const sourceGroup of groups.sources) {
    if (sourceGroup.enabled) {
      try {
        // 这里可以实现检查群组状态的逻辑
        // 例如检查是否有新消息、成员变化等
        console.log(`检查群组状态: ${sourceGroup.name} (ID: ${sourceGroup.id})`);
        
        // 这里是一个占位符，实际实现需要根据Telegraf API和需求进行调整
      } catch (error) {
        console.error(`检查群组 ${sourceGroup.name} 状态失败:`, error);
      }
    }
  }
};

// 获取系统状态
const getSystemStatus = async () => {
  const groups = database.getGroups();
  const rules = database.getRules();
  const settings = database.getSettings();

  const status = `📊 系统状态\n\n` +
    `环境: ${process.env.NODE_ENV || 'development'}\n` +
    `源群组数量: ${groups.sources.length}\n` +
    `目标群组数量: ${groups.targets.length}\n` +
    `全局规则数量: ${Object.keys(rules.global).length}\n` +
    `群组专属规则: ${Object.keys(rules.groupSpecific).length}\n` +
    `检查间隔: ${(settings.checkInterval || 300000) / 60000} 分钟\n` +
    `上次检查: ${new Date(settings.lastCheck).toLocaleString()}\n` +
    `运行时间: ${utils.getUptime()}`;

  return status;
};

// 导出模块
module.exports = {
  init,
  getSystemStatus
};