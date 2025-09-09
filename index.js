// 加载环境变量
require('dotenv').config();

// 导入日志模块
const logger = require('./src/logger');

// 内存使用监控和泄漏检测
const v8 = require('v8');
const heapStats = () => {
  const heap = process.memoryUsage();
  const stats = {
    rss: Math.round(heap.rss / 1024 / 1024) + 'MB',
    heapTotal: Math.round(heap.heapTotal / 1024 / 1024) + 'MB',
    heapUsed: Math.round(heap.heapUsed / 1024 / 1024) + 'MB',
    external: Math.round(heap.external / 1024 / 1024) + 'MB'
  };
  logger.info('内存使用:', stats);
  return stats;
};

// 定时记录内存使用情况
setInterval(() => {
  heapStats();
}, 300000); // 每5分钟记录一次

// 添加全面的错误处理
process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的 Promise 拒绝:', reason);
  // 尝试重新启动机器人
  setTimeout(() => {
    try {
      logger.info('尝试重新启动机器人以恢复未处理的Promise拒绝...');
      process.exit(3); // 使用特殊退出码表示需要重启
    } catch (error) {
      logger.error('重启机器人失败:', error);
    }
  }, 5000);
});

process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error);
  // 记录错误并尝试优雅重启
  setTimeout(() => {
    try {
      logger.info('尝试重新启动机器人以恢复未捕获的异常...');
      process.exit(3); // 使用特殊退出码表示需要重启
    } catch (err) {
      logger.error('重启机器人失败:', err);
    }
  }, 5000);
});

// 添加看门狗定时器
let lastActivity = Date.now();
setInterval(() => {
  if (Date.now() - lastActivity > 600000) { // 10分钟无活动
    logger.warn('看门狗检测到无响应，重启机器人...');
    process.exit(1); // 让进程管理器重启
  }
}, 60000); // 每分钟检查一次

// HTTP健康检查服务器的修改
function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'ok',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        lastActivity: new Date(lastActivity).toISOString()
      }));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(3001, '0.0.0.0', () => {
    logger.info('健康检查服务器运行在端口 3001');
  });
  
  return server;
}

// 在机器人活动时更新最后活动时间
function updateActivity() {
  lastActivity = Date.now();
}

// 导入必要的模块
const { Telegraf } = require('telegraf');
// 创建高级日志系统
const fs = require('fs-extra');
const path = require('path');

// 删除之前添加的Logger类实现代码

// 创建全局日志实例
const logger = new Logger();

// 检查必要的目录是否存在
const ensureDirectories = async () => {
  try {
    // 确保数据目录存在
    await fs.ensureDir(path.join(__dirname, 'data'));
    // 确保src目录存在
    await fs.ensureDir(path.join(__dirname, 'src'));
    // 确保scripts目录存在
    await fs.ensureDir(path.join(__dirname, 'scripts'));
    
    logger.info('所有必要的目录已创建');
  } catch (error) {
    logger.error('创建目录时出错:', error);
    process.exit(1);
  }
};

// 初始化数据文件
const initializeData = async () => {
  const dataDir = path.join(__dirname, 'data');
  const files = {
    'groups.json': JSON.stringify({ sources: [], targets: [] }, null, 2),
    'rules.json': JSON.stringify({ global: {}, groupSpecific: {} }, null, 2),
    'settings.json': JSON.stringify({ autoStart: true, checkInterval: 300000 }, null, 2)
  };
  
  // 检查并创建缺失的文件
  for (const [filename, content] of Object.entries(files)) {
    const filepath = path.join(dataDir, filename);
    if (!await fs.pathExists(filepath)) {
      logger.info(`创建默认数据文件: ${filename}`);
      await fs.writeFile(filepath, content);
    }
  }
};

// 进程健康检查和自动重启机制
const setupHealthCheck = (bot) => {
  let isHealthy = true;
  let restartAttempts = 0;
  const MAX_RESTART_ATTEMPTS = 5;
  const RESTART_DELAY = 5000; // 5秒
  
  // 定期检查机器人健康状态
  const healthCheckInterval = setInterval(async () => {
    try {
      // 简单的健康检查：尝试获取系统状态
      const status = await require('./src/bot').getSystemStatus();
      
      if (status && !status.includes('失败')) {
        isHealthy = true;
        //logger.debug('健康检查通过');
      } else {
        throw new Error('获取系统状态失败');
      }
    } catch (error) {
      logger.error('健康检查失败:', error);
      isHealthy = false;
      
      // 尝试重启
      if (restartAttempts < MAX_RESTART_ATTEMPTS) {
        logger.info(`尝试重启机器人（第${restartAttempts + 1}次尝试）`);
        restartAttempts++;
        
        // 延迟重启，避免频繁重启
        setTimeout(() => {
          try {
            logger.info('正在重启机器人...');
            // 先停止机器人
            if (bot) {
              bot.stop('health_check_restart');
            }
            
            // 重新启动应用
            process.exit(3); // 使用特殊退出码表示需要重启
          } catch (restartError) {
            logger.error('重启机器人失败:', restartError);
          }
        }, RESTART_DELAY);
      } else {
        logger.error(`已达到最大重启次数(${MAX_RESTART_ATTEMPTS})，不再尝试重启`);
        clearInterval(healthCheckInterval);
        
        // 通知管理员
        const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
        for (const adminId of adminIds) {
          try {
            if (bot && bot.telegram) {
              await bot.telegram.sendMessage(adminId, 
                `⚠️ 机器人健康检查失败且已达到最大重启次数，需要人工干预！`);
            }
          } catch (err) {
            logger.error(`通知管理员失败: ${err.message}`);
          }
        }
      }
    }
  }, 300000); // 每5分钟检查一次
  
  logger.info('健康检查机制已启动，每5分钟检查一次');
  
  // 返回停止检查的函数
  return () => {
    clearInterval(healthCheckInterval);
    logger.info('健康检查已停止');
  };
};

// 在initBot函数末尾添加健康检查
// 启动机器人
const initBot = async () => {
  try {
    // 检查必要的环境变量
    if (!process.env.BOT_TOKEN) {
      logger.error('错误: 请在.env文件中设置BOT_TOKEN');
      process.exit(1);
    }

    // 创建机器人实例
    // 创建更稳健的Telegraf实例
    const bot = new Telegraf(process.env.BOT_TOKEN, {
      telegram: {
        apiRoot: 'https://api.telegram.org',
        // 增加超时和重试设置
        agent: null,
        webhookReply: false,
        retryAfter: 1
      },
      handlerTimeout: 30000, // 30秒超时
      contextType: 'default'
    });
    
    // 添加请求中间件记录活动
    bot.use((ctx, next) => {
      updateActivity(); // 更新最后活动时间
      logger.debug(`收到更新: ${ctx.updateType}`);
      return next();
    });
    
    // 添加请求错误处理
    bot.catch((err, ctx) => {
      logger.error(`机器人错误:`, err);
      updateActivity();
      // 尝试回复用户错误信息
      ctx.reply('❌ 操作失败，请稍后重试').catch(() => {});
    });

    // 添加Telegram API连接状态监控
    let connectionErrors = 0;
    const MAX_CONNECTION_ERRORS = 5;
    
    // 监控连接错误
    bot.telegram.on('error', (err) => {
      logger.error('Telegram API 错误:', err);
      connectionErrors++;
      updateActivity();
      
      if (connectionErrors >= MAX_CONNECTION_ERRORS) {
        logger.error('连接错误过多，重启进程...');
        process.exit(1);
      }
    });
    
    // 成功请求后重置错误计数
    bot.telegram.on('response', () => {
      connectionErrors = 0;
      updateActivity();
    });
    
    // 定期重置错误计数
    setInterval(() => {
      connectionErrors = Math.max(0, connectionErrors - 1);
    }, 60000); // 每分钟减少一个错误计数

    // 加载核心模块
    const botModule = require('./src/bot');
    const handlers = require('./src/handlers');
    const database = require('./src/database');

    // 初始化数据库
    await database.init();

    // 初始化机器人核心功能
    await botModule.init(bot, database, handlers, updateActivity);

    // 启动机器人
    bot.launch().then(() => {
      logger.info('机器人已成功启动');
      logger.info(`管理员ID: ${process.env.ADMIN_IDS || '未设置'}`);
      logger.info(`环境: ${process.env.NODE_ENV || 'development'}`);
      
      // 启动健康检查
      const stopHealthCheck = setupHealthCheck(bot);
      
      // 在机器人停止时也停止健康检查
      bot.stopCallback = () => {
        stopHealthCheck();
      };
    });

    // 优雅退出处理 - 带强制超时
    const FORCE_SHUTDOWN_TIMEOUT = 10000; // 10秒
    
    async function gracefulShutdown(signal) {
      logger.info(`收到 ${signal}，开始优雅关闭...`);
      
      // 停止接收新请求
      if (bot && bot.stop) {
        bot.stop();
      }
      
      // 设置强制超时
      const timeoutId = setTimeout(() => {
        logger.error('优雅关闭超时，强制退出');
        process.exit(1);
      }, FORCE_SHUTDOWN_TIMEOUT);
      
      // 等待进行中的操作完成
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 清除超时计时器
      clearTimeout(timeoutId);
      
      logger.info('关闭完成');
      process.exit(0);
    }
    
    // 注册关闭信号
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  } catch (error) {
    logger.error('初始化机器人时出错:', error);
    process.exit(1);
  }
};

// 主函数
const main = async () => {
  logger.info('开始初始化Telegram监控机器人...');
  await ensureDirectories();
  // 在启动机器人前初始化数据文件
  await initializeData();
  await initBot();
};

// 启动应用
main();

// 添加 HTTP 健康检查服务器
const http = require('http');

function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'ok',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        lastActivity: new Date(lastActivity).toISOString()
      }));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(3001, '0.0.0.0', () => {
    console.log('健康检查服务器运行在端口 3001');
  });
  
  return server;
}

// 在应用启动时调用
startHealthServer();