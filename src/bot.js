const { Telegraf, Markup } = require('telegraf');
const cron = require('node-cron');
const fs = require('fs-extra');
const path = require('path');

// 导入日志模块
const logger = require('./logger');

// 全局错误处理
process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的 Promise 拒绝:', reason);
  // 可以添加通知管理员的逻辑
});

process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error);
  // 可以添加重启逻辑或通知管理员
});

// 导入自定义模块
const keyboard = require('./keyboard');
const utils = require('./utils');

// 机器人实例
let bot = null;
let database = null;
let handlers = null;

// 在文件顶部添加updateActivity变量
let updateActivity = () => {}; // 默认空函数

// 初始化机器人核心功能
const init = async (botInstance, dbInstance, handlersInstance, updateActivityFn) => {
  bot = botInstance;
  database = dbInstance;
  handlers = handlersInstance;
  
  // 存储更新活动时间的函数
  updateActivity = updateActivityFn || (() => {});
  
  // 设置handlers中的活动跟踪器
  if (handlers.setupActivityTracker) {
    handlers.setupActivityTracker(updateActivity);
  }

  try {
    // 设置自动恢复机制
    await setupAutoRecovery();
    
    // 初始化命令
    initCommands(updateActivity);
    
    // 初始化消息处理
    initMessageProcessing(updateActivity);
    
    // 初始化回调处理
    initCallbackHandlers(updateActivity);
    
    // 异步初始化定时任务
    await initCronJobs();
    
    logger.info('机器人核心功能初始化完成');
  } catch (error) {
    logger.error('机器人初始化过程中出错:', error);
    // 通知管理员
    notifyAdminsOfError(`⚠️ 机器人初始化失败: ${error.message}`);
  }
};

// 初始化命令
const initCommands = (updateActivity) => {
  // 开始命令 - 显示主菜单
  bot.command('start', async (ctx) => {
    // 更新活动时间
    updateActivity();
    
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
    // 更新活动时间
    updateActivity();
    
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
    // 更新活动时间
    updateActivity();
    
    const isAdmin = await utils.isAdmin(ctx.from.id);
    if (!isAdmin) {
      return ctx.reply('抱歉，只有管理员可以使用此机器人。');
    }

    const status = await getSystemStatus();
    await ctx.reply(status);
  });

  // Ping命令
  bot.command('ping', async (ctx) => {
    // 更新活动时间
    updateActivity();
    
    const isAdmin = await utils.isAdmin(ctx.from.id);
    if (!isAdmin) {
      return ctx.reply('抱歉，只有管理员可以使用此机器人。');
    }

    await ctx.reply('Pong! 机器人运行正常。');
  });
};

// 初始化消息处理
const initMessageProcessing = (updateActivity) => {
  // 监听所有文本消息
  bot.on('text', async (ctx) => {
    // 更新活动时间
    updateActivity();
    
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
    // 更新活动时间
    updateActivity();
    
    const isAdmin = await utils.isAdmin(ctx.from.id);
    if (!isAdmin) {
      return;
    }

    // 对于非文本消息，可以根据需要处理
    await ctx.reply('收到非文本消息，但当前版本暂不支持处理。');
  });
};

// 初始化回调处理
const initCallbackHandlers = (updateActivity) => {
  // 菜单导航回调
  bot.action(/^menu:([a-z]+)$/, async (ctx) => {
    // 更新活动时间
    updateActivity();
    
    const menuType = ctx.match[1];
    await handlers.handleMenuNavigation(ctx, menuType);
  });

  // 操作回调
  bot.action(/^action:([a-z]+):(.+)$/, async (ctx) => {
    // 更新活动时间
    updateActivity();
    
    const actionType = ctx.match[1];
    const actionParams = ctx.match[2];
    await handlers.handleAction(ctx, actionType, actionParams);
  });

  // 返回按钮回调
  bot.action('back', async (ctx) => {
    // 更新活动时间
    updateActivity();
    
    await handlers.handleBack(ctx);
  });
};

// 初始化定时任务
const initCronJobs = async () => {
  try {
    // 异步获取系统设置
    const settings = await database.getSettings();
    
    // 根据设置的检查间隔创建定时任务
    const interval = settings.checkInterval || 300000; // 默认5分钟
    const cronExpression = `*/${interval / 60000} * * * *`; // 转换为分钟

    logger.info(`定时任务已设置，每 ${interval / 60000} 分钟执行一次`);
    
    // 定时检查任务 - 添加防抖机制
    let isProcessing = false;
    cron.schedule(cronExpression, async () => {
      // 如果上一次任务还在执行，则跳过本次
      if (isProcessing) {
        logger.info('上一次定时任务仍在执行，跳过本次任务');
        return;
      }
      
      isProcessing = true;
      logger.info('执行定时检查...');
      
      try {
        const result = await checkGroupsStatus();
        logger.info(`定时检查完成: 检查了 ${result.checked} 个群组, ${result.errors} 个错误`);
        
        // 更新最后检查时间
        await database.updateLastCheckTime();
      } catch (error) {
        logger.error('定时任务执行失败:', error);
        
        // 通知管理员 - 使用异步批量处理
        notifyAdminsOfError(`⚠️ 定时任务执行失败: ${error.message}`);
      } finally {
        isProcessing = false;
      }
    });
  } catch (error) {
    logger.error('初始化定时任务失败:', error);
    // 通知管理员
    notifyAdminsOfError(`⚠️ 初始化定时任务失败: ${error.message}`);
  }
};

// 异步通知管理员的错误信息
const notifyAdminsOfError = async (message) => {
  try {
    const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
    if (!adminIds.length) return;
    
    // 使用批量处理来减少阻塞
    const notificationPromises = adminIds.map(async (adminId) => {
      try {
        await bot.telegram.sendMessage(adminId, message);
        return { success: true };
      } catch (err) {
        logger.error(`通知管理员失败: ${err.message}`);
        return { success: false, error: err };
      }
    });
    
    // 并发发送通知但限制并发数
    await processBatch(notificationPromises, 3); // 每次最多3个并发
  } catch (error) {
    logger.error('通知管理员过程中出错:', error);
  }
};

// 批量处理Promise数组，限制并发数
const processBatch = async (promises, batchSize = 5) => {
  const results = [];
  
  for (let i = 0; i < promises.length; i += batchSize) {
    const batch = promises.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
    
    // 小延迟避免过于密集的请求
    if (i + batchSize < promises.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
};

// 检查所有群组状态
const checkGroupsStatus = async () => {
  const stats = { checked: 0, errors: 0 };
  try {
    // 从数据库获取所有需要监控的群组
    const groups = await database.getAllGroups();
    
    // 使用并发处理，但限制并发数
    const groupPromises = groups.map(group => 
      checkSingleGroupStatus(group.id, group.name)
        .then(() => { stats.checked++; })
        .catch(error => {
          stats.errors++;
          logger.error(`检查群组 ${group.name} 失败:`, error);
        })
    );
    
    // 分批处理以避免过多并发
    await processBatch(groupPromises, 5);
  } catch (error) {
    logger.error('检查所有群组状态失败:', error);
    stats.errors++;
  }
  return stats;
};

// 检查单个群组状态
const checkSingleGroupStatus = async (groupId, groupName) => {
  try {
    // 检查群组是否可达
    const chat = await bot.telegram.getChat(groupId);
    logger.info(`成功检查群组: ${groupName} (${chat.id})`);
    
    // 记录群组信息
    await database.updateGroupInfo(groupId, {
      name: chat.title,
      membersCount: chat.members_count || 0,
      lastSeen: Date.now()
    });
  } catch (error) {
    logger.error(`群组 ${groupName} 状态异常:`, error);
    
    // 记录错误并通知管理员
    await database.recordGroupError(groupId, {
      timestamp: Date.now(),
      errorType: error.code || 'UNKNOWN_ERROR',
      errorMessage: error.message
    });
    
    // 通知管理员群组状态异常
    notifyAdminsOfError(`⚠️ 群组 ${groupName} 状态异常: ${error.message}`);
    
    // 如果群组不可访问，可以选择从监控列表移除
    if (error.code === 403 || error.code === 400) {
      logger.warn(`群组 ${groupName} 不再可访问，考虑从监控列表移除`);
      // 实际项目中可能需要自动或手动移除
    }
  }
};

// 重启恢复机制
const setupAutoRecovery = async () => {
  try {
    // 创建恢复状态文件路径
    const recoveryFile = path.join(__dirname, '..', 'data', 'recovery_state.json');
    
    // 保存当前状态 - 在关机信号时调用
    const saveState = async () => {
      try {
        const state = {
          timestamp: Date.now(),
          botStarted: true,
          lastCheck: (await database.getSettings()).lastCheck,
          // 可以添加更多需要恢复的状态信息
        };
        
        await fs.writeJSON(recoveryFile, state, { spaces: 2 });
        logger.info('已保存恢复状态');
      } catch (error) {
        logger.error('保存恢复状态失败:', error);
      }
    };
    
    // 加载并恢复状态
    const recoverState = async () => {
      try {
        if (await fs.pathExists(recoveryFile)) {
          const state = await fs.readJSON(recoveryFile);
          
          // 检查状态是否有效（例如，是否在合理的时间范围内）
          const now = Date.now();
          const timeDiff = now - state.timestamp;
          
          // 如果状态是在过去24小时内保存的，则尝试恢复
          if (timeDiff < 24 * 60 * 60 * 1000) {
            logger.info('正在恢复机器人状态...');
            
            // 标记状态已恢复
            await fs.writeJSON(recoveryFile, {
              ...state,
              recovered: true,
              recoveryTime: now
            }, { spaces: 2 });
            
            logger.info('机器人状态恢复完成');
          }
          
          // 无论是否恢复，都删除旧的恢复状态文件
          await fs.remove(recoveryFile);
        }
      } catch (error) {
        logger.error('恢复机器人状态失败:', error);
      }
    };
    
    // 注册关机信号处理，保存状态
    process.on('SIGINT', async () => {
      logger.info('收到终止信号，正在保存状态...');
      await saveState();
    });
    
    process.on('SIGTERM', async () => {
      logger.info('收到终止信号，正在保存状态...');
      await saveState();
    });
    
    // 在启动时尝试恢复状态
    await recoverState();
    
  } catch (error) {
    logger.error('设置自动恢复机制失败:', error);
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
    logger.error('获取系统状态时出错:', error);
    return `❌ 系统状态获取失败\n错误信息: ${error.message}`;
  }
};

// 导出模块
module.exports = {
  init,
  getSystemStatus
};