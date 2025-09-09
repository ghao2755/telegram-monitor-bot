// 导入必要的模块
const { Telegraf, Markup } = require('telegraf');
const cron = require('node-cron');
const fs = require('fs-extra');
const path = require('path');

// 全局错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason);
  // 可以添加通知管理员的逻辑
});

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  // 可以添加重启逻辑或通知管理员
});

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

  // 定时检查任务
  cron.schedule(cronExpression, async () => {
    console.log('执行定时检查...');
    try {
      const result = await checkGroupsStatus();
      console.log(`定时检查完成: 检查了 ${result.checked} 个群组, ${result.errors} 个错误`);
      
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
  try {
    const groups = await database.getGroups() || { sources: [], targets: [] };
    
    // 确保 sources 是数组
    const sources = Array.isArray(groups.sources) ? groups.sources : [];
    
    for (const source of sources) {
      // 检查每个源群组的状态
      try {
        // 这里添加实际的群组状态检查逻辑
        console.log(`检查群组: ${source.id || '未知群组'}`);
      } catch (error) {
        console.error(`检查群组 ${source.id} 时出错:`, error);
      }
    }
    
    return { checked: sources.length, errors: 0 };
  } catch (error) {
    console.error('检查群组状态时发生错误:', error);
    return { checked: 0, errors: 1, message: error.message };
  }
};

// 获取系统状态
const getSystemStatus = async () => {
  try {
    // 确保从数据库读取数据时提供默认值
    const groups = await database.getGroups() || { sources: [], targets: [] };
    const rules = await database.getRules() || { global: {}, groupSpecific: {} };
    const settings = await database.getSettings() || {};
    
    // 添加空值检查
    const sourceCount = groups.sources ? groups.sources.length : 0;
    const targetCount = groups.targets ? groups.targets.length : 0;
    const globalRuleCount = rules.global ? Object.keys(rules.global).length : 0;
    
    // 计算群组专属规则总数
    let groupRuleCount = 0;
    if (rules.groupSpecific) {
      for (const groupId in rules.groupSpecific) {
        if (rules.groupSpecific[groupId].rules) {
          groupRuleCount += Object.keys(rules.groupSpecific[groupId].rules).length;
        }
      }
    }
    
    // 格式化返回状态信息字符串
    const statusMessage = `📊 系统状态\n\n` +
      `环境: ${process.env.NODE_ENV || 'development'}\n` +
      `源群组数量: ${sourceCount}\n` +
      `目标群组数量: ${targetCount}\n` +
      `全局规则数量: ${globalRuleCount}\n` +
      `群组专属规则总数: ${groupRuleCount}\n` +
      `群组专属规则配置数: ${rules.groupSpecific ? Object.keys(rules.groupSpecific).length : 0}\n` +
      `检查间隔: ${(settings.checkInterval || 300000) / 60000} 分钟\n` +
      `上次检查: ${settings.lastCheck ? new Date(settings.lastCheck).toLocaleString() : '从未检查'}\n` +
      `运行时间: ${utils.getUptime()}`;
    
    return statusMessage;
    
  } catch (error) {
    console.error('获取系统状态时出错:', error);
    return `❌ 系统状态获取失败\n错误信息: ${error.message}`;
  }
};

// 导出模块
module.exports = {
  init,
  getSystemStatus
};