import { Telegraf } from 'telegraf';
import type { Context } from 'telegraf';
import configManager from '../utils/config';
import logger from '../utils/logger';
import dbManager from '../utils/db';
import MessageMonitor from '../services/messageMonitor';
import MessageForwarder from '../services/messageForwarder';
import healthCheckService from '../services/healthCheckService';
import apiRateLimiter from '../services/apiRateLimiter';
import statsService from '../services/statsService';

/**
 * Telegram Bot 主类，管理机器人的生命周期和功能
 */
export class Bot {
  private bot: Telegraf;
  private messageMonitor: MessageMonitor;
  private messageForwarder: MessageForwarder;
  private healthCheckService = healthCheckService;
  private apiRateLimiter = apiRateLimiter;
  private statsService = statsService;
  private isRunning: boolean = false;

  constructor() {
    const token = configManager.getBotToken();
    if (!token) {
      throw new Error('BOT_TOKEN is not set in .env file');
    }

    this.bot = new Telegraf(token);
    this.messageMonitor = new MessageMonitor(this.bot);
    this.messageForwarder = new MessageForwarder(this.bot);
  }

  /**
   * 初始化机器人
   */
  public async initialize(): Promise<void> {
    try {
      // 连接数据库
      await dbManager.connect();

      // 设置健康检查服务的bot实例
      this.healthCheckService.setBot(this.bot);

      // 设置命令和处理程序
      this.setupCommands();
      this.setupEventHandlers();
      this.setupButtonHandlers();

      logger.info('Bot initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize bot:', error);
      throw error;
    }
  }

  /**
   * 启动机器人
   */
  public async start(): Promise<void> {
    try {
      if (this.isRunning) {
        logger.warn('Bot is already running');
        return;
      }

      // 启动消息监控服务
      this.messageMonitor.start();

      // 启动高级功能服务
      this.healthCheckService.startHealthCheck();
      this.apiRateLimiter.startMonitoring();

      // 启动Telegraf机器人
      await this.bot.launch();

      this.isRunning = true;
      logger.info('Bot started successfully');

      // 处理进程终止信号
      this.handleProcessSignals();
    } catch (error) {
      logger.error('Failed to start bot:', error);
      throw error;
    }
  }

  /**
   * 停止机器人
   */
  public async stop(): Promise<void> {
    try {
      if (!this.isRunning) {
        logger.warn('Bot is not running');
        return;
      }

      // 停止消息监控服务
      this.messageMonitor.stop();

      // 停止高级功能服务
      this.healthCheckService.stopHealthCheck();
      this.apiRateLimiter.stopMonitoring();

      // 停止Telegraf机器人
      await this.bot.stop();

      // 断开数据库连接
      await dbManager.disconnect();

      this.isRunning = false;
      logger.info('Bot stopped gracefully');
    } catch (error) {
      logger.error('Failed to stop bot gracefully:', error);
      throw error;
    }
  }

  /**
   * 设置机器人命令
   */
  private setupCommands(): void {
    // /start 命令 - 显示主菜单
    this.bot.command('start', async (ctx: Context) => {
      await this.showMainMenu(ctx);
    });

    // /status 命令 - 显示机器人状态
    this.bot.command('status', async (ctx: Context) => {
      await this.showStatus(ctx);
    });

    // /help 命令 - 显示帮助信息
    this.bot.command('help', async (ctx: Context) => {
      await this.showHelp(ctx);
    });

    // /stats 命令 - 显示转发统计报告
    this.bot.command('stats', async (ctx: Context) => {
      await this.showStatsReport(ctx);
    });

    // /api_stats 命令 - 显示API使用统计报告
    this.bot.command('api_stats', async (ctx: Context) => {
      await this.showApiUsageReport(ctx);
    });

    // /health 命令 - 显示健康检查状态
    this.bot.command('health', async (ctx: Context) => {
      await this.showHealthStatus(ctx);
    });

    // /add_alert 命令 - 添加警报接收者
    this.bot.command('add_alert', async (ctx: Context) => {
      await this.addAlertRecipient(ctx);
    });

    // /remove_alert 命令 - 移除警报接收者
    this.bot.command('remove_alert', async (ctx: Context) => {
      await this.removeAlertRecipient(ctx);
    });
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    // 处理接收到的消息
    this.bot.on('message', async (ctx: Context) => {
      try {
        const message = ctx.message;
        if (message) {
          // 让消息监控服务处理消息
          await this.messageMonitor.processMessage(message);
          
          // 这里可以添加更多的消息处理逻辑
          // 例如，检查消息是否来自管理用户，或者是否包含特定命令
        }
      } catch (error: unknown) {
        logger.error('Error processing message event:', error);
      }
    });

    // 处理错误
    this.bot.catch((err: unknown, ctx: Context) => {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(`Error in bot context ${ctx.updateType}:`, error);
    });
  }

  /**
   * 设置按钮回调处理器
   */
  private setupButtonHandlers(): void {
    // 主菜单按钮回调
    this.bot.action('menu_source_groups', async (ctx: Context) => {
      await this.showSourceGroupsMenu(ctx);
    });

    this.bot.action('menu_target_groups', async (ctx: Context) => {
      await this.showTargetGroupsMenu(ctx);
    });

    this.bot.action('menu_forwarding_rules', async (ctx: Context) => {
      await this.showForwardingRulesMenu(ctx);
    });

    this.bot.action('menu_back', async (ctx: Context) => {
      await this.showMainMenu(ctx);
    });

    // 可以在这里添加更多按钮回调处理器
  }

  /**
   * 显示主菜单
   */
  private async showMainMenu(ctx: Context): Promise<void> {
    try {
      await ctx.reply('请选择要执行的操作:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📝 管理源群组', callback_data: 'menu_source_groups' }],
            [{ text: '📨 管理目标群组', callback_data: 'menu_target_groups' }],
            [{ text: '⚙️ 管理转发规则', callback_data: 'menu_forwarding_rules' }],
            [{ text: '📊 查看机器人状态', callback_data: 'menu_status' }],
          ]
        }
      });
    } catch (error) {
      logger.error('Failed to show main menu:', error);
      await ctx.reply('显示菜单时出错，请稍后再试。');
    }
  }

  /**
   * 显示源群组管理菜单
   */
  private async showSourceGroupsMenu(ctx: Context): Promise<void> {
    try {
      // 在实际实现中，这里应该显示当前配置的源群组列表和管理选项
      await ctx.reply('源群组管理:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ 添加源群组', callback_data: 'add_source_group' }],
            [{ text: '➖ 移除源群组', callback_data: 'remove_source_group' }],
            [{ text: '📋 查看源群组列表', callback_data: 'list_source_groups' }],
            [{ text: '⬅️ 返回', callback_data: 'menu_back' }],
          ]
        }
      });
    } catch (error) {
      logger.error('Failed to show source groups menu:', error);
      await ctx.reply('显示源群组菜单时出错，请稍后再试。');
    }
  }

  /**
   * 显示目标群组管理菜单
   */
  private async showTargetGroupsMenu(ctx: Context): Promise<void> {
    try {
      // 在实际实现中，这里应该显示当前配置的目标群组列表和管理选项
      await ctx.reply('目标群组管理:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ 添加目标群组', callback_data: 'add_target_group' }],
            [{ text: '➖ 移除目标群组', callback_data: 'remove_target_group' }],
            [{ text: '📋 查看目标群组列表', callback_data: 'list_target_groups' }],
            [{ text: '⬅️ 返回', callback_data: 'menu_back' }],
          ]
        }
      });
    } catch (error) {
      logger.error('Failed to show target groups menu:', error);
      await ctx.reply('显示目标群组菜单时出错，请稍后再试。');
    }
  }

  /**
   * 显示转发规则管理菜单
   */
  private async showForwardingRulesMenu(ctx: Context): Promise<void> {
    try {
      // 在实际实现中，这里应该显示当前配置的转发规则列表和管理选项
      await ctx.reply('转发规则管理:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ 创建转发规则', callback_data: 'create_forwarding_rule' }],
            [{ text: '✏️ 编辑转发规则', callback_data: 'edit_forwarding_rule' }],
            [{ text: '➖ 删除转发规则', callback_data: 'delete_forwarding_rule' }],
            [{ text: '📋 查看转发规则列表', callback_data: 'list_forwarding_rules' }],
            [{ text: '⬅️ 返回', callback_data: 'menu_back' }],
          ]
        }
      });
    } catch (error) {
      logger.error('Failed to show forwarding rules menu:', error);
      await ctx.reply('显示转发规则菜单时出错，请稍后再试。');
    }
  }

  /**
   * 显示机器人状态信息
   */
  private async showStatus(ctx: Context): Promise<void> {
    try {
      const monitorStatus = this.messageMonitor.getStatus();
      const prisma = dbManager.getClient();
      
      // 获取数据库中的群组和规则数量
      const sourceGroupsCount = await prisma.sourceGroup.count();
      const targetGroupsCount = await prisma.targetGroup.count();
      const forwardingRulesCount = await prisma.forwardingRule.count();
      const filterRulesCount = await prisma.filterRule.count();
      const messageFormatsCount = await prisma.messageFormat.count();
      
      // 获取高级功能状态
      const healthCheckStatus = this.healthCheckService.getStatus();
      const apiRateLimiterStatus = this.apiRateLimiter.getStatus();
      
      const statusMessage = `🚀 机器人状态\n\n` +
        `🟢 运行状态: ${this.isRunning ? '在线' : '离线'}\n` +
        `🔄 消息监控: ${monitorStatus.isRunning ? '开启' : '关闭'}\n` +
        `⏱️ 轮询间隔: ${monitorStatus.pollingInterval}ms\n\n` +
        `📊 配置统计\n` +
        `📝 源群组数量: ${sourceGroupsCount}\n` +
        `📨 目标群组数量: ${targetGroupsCount}\n` +
        `⚙️ 转发规则数量: ${forwardingRulesCount}\n` +
        `🔍 过滤规则数量: ${filterRulesCount}\n` +
        `📝 消息格式数量: ${messageFormatsCount}\n\n` +
        `🔐 高级功能状态\n` +
        `❤️ 健康检查: ${healthCheckStatus.isRunning ? '开启' : '关闭'} (警报接收者: ${healthCheckStatus.alertRecipients})\n` +
        `📈 API限流监控: 跟踪方法数: ${apiRateLimiterStatus.trackedMethods} (总调用数: ${apiRateLimiterStatus.totalCalls})\n\n` +
        `💡 可用命令:\n` +
        `/stats - 查看转发统计报告\n` +
        `/api_stats - 查看API使用统计\n` +
        `/health - 查看健康检查状态\n` +
        `/add_alert - 添加警报接收者\n` +
        `/remove_alert - 移除警报接收者`;
      
      await ctx.reply(statusMessage);
    } catch (error) {
      logger.error('Failed to show bot status:', error);
      await ctx.reply('获取机器人状态时出错，请稍后再试。');
    }
  }

  /**
   * 显示转发统计报告
   */
  private async showStatsReport(ctx: Context): Promise<void> {
    try {
      logger.info(`Generating stats report for user ${ctx.chat?.id}`);
      const report = await this.statsService.generateStatsReportText();
      await ctx.reply(report);
    } catch (error) {
      logger.error('Failed to show stats report:', error);
      await ctx.reply('生成统计报告时出错，请稍后再试。');
    }
  }

  /**
   * 显示API使用统计报告
   */
  private async showApiUsageReport(ctx: Context): Promise<void> {
    try {
      logger.info(`Generating API usage report for user ${ctx.chat?.id}`);
      const report = this.apiRateLimiter.generateApiUsageReport();
      await ctx.reply(report);
    } catch (error) {
      logger.error('Failed to show API usage report:', error);
      await ctx.reply('生成API使用报告时出错，请稍后再试。');
    }
  }

  /**
   * 显示健康检查状态
   */
  private async showHealthStatus(ctx: Context): Promise<void> {
    try {
      logger.info(`Generating health status for user ${ctx.chat?.id}`);
      
      // 执行一次健康检查
      const healthResult = await this.healthCheckService.performHealthCheck();
      
      let statusEmoji = '🟢'; // 默认OK
      if (healthResult.status === 'WARNING') {
        statusEmoji = '🟡';
      } else if (healthResult.status === 'ERROR') {
        statusEmoji = '🔴';
      }
      
      let healthMessage = `${statusEmoji} 机器人健康状态\n\n` +
        `状态: ${healthResult.status}\n` +
        `消息: ${healthResult.message}\n` +
        `检查时间: ${healthResult.timestamp.toLocaleString()}\n\n`;
      
      // 添加详细信息
      if (healthResult.details && Array.isArray(healthResult.details)) {
        healthMessage += `📋 组件状态详情\n`;
        
        (healthResult.details as any[]).forEach((component: any) => {
          let componentEmoji = '🟢';
          if (component.status === 'WARNING') {
            componentEmoji = '🟡';
          } else if (component.status === 'ERROR') {
            componentEmoji = '🔴';
          }
          
          healthMessage += `${componentEmoji} ${component.message}\n`;
        });
      }
      
      await ctx.reply(healthMessage);
    } catch (error) {
      logger.error('Failed to show health status:', error);
      await ctx.reply('获取健康状态时出错，请稍后再试。');
    }
  }

  /**
   * 添加警报接收者
   */
  private async addAlertRecipient(ctx: Context): Promise<void> {
    try {
      const chatId = ctx.chat?.id?.toString();
      if (!chatId) {
        await ctx.reply('无法获取聊天ID，请稍后再试。');
        return;
      }
      
      this.healthCheckService.addAlertChatId(chatId);
      await ctx.reply(`✅ 已成功添加为警报接收者！当机器人出现异常时，您将收到通知。`);
      logger.info(`Alert recipient added: ${chatId}`);
    } catch (error) {
      logger.error('Failed to add alert recipient:', error);
      await ctx.reply('添加警报接收者时出错，请稍后再试。');
    }
  }

  /**
   * 移除警报接收者
   */
  private async removeAlertRecipient(ctx: Context): Promise<void> {
    try {
      const chatId = ctx.chat?.id?.toString();
      if (!chatId) {
        await ctx.reply('无法获取聊天ID，请稍后再试。');
        return;
      }
      
      this.healthCheckService.removeAlertChatId(chatId);
      await ctx.reply(`✅ 已成功移除警报接收者！您将不再收到机器人异常通知。`);
      logger.info(`Alert recipient removed: ${chatId}`);
    } catch (error) {
      logger.error('Failed to remove alert recipient:', error);
      await ctx.reply('移除警报接收者时出错，请稍后再试。');
    }
  }

  /**
   * 显示帮助信息
   */
  private async showHelp(ctx: Context): Promise<void> {
    try {
      const helpMessage = `📚 Telegram 消息转发机器人使用帮助\n\n` +
        `💡 这个机器人可以监控指定群组的消息并自动转发到其他群组。\n\n` +
        `📝 可用命令:\n` +
        `/start - 启动机器人并显示主菜单\n` +
        `/status - 查看机器人当前状态\n` +
        `/help - 显示此帮助信息\n\n` +
        `⚙️ 主要功能:\n` +
        `• 消息监控和自动转发\n` +
        `• 支持文本替换（包括正则表达式）\n` +
        `• 每个目标群组独立设置置顶选项\n` +
        `• 每个目标群组可选择不同的转发规则\n` +
        `• 完整的群组和规则管理界面`;
      
      await ctx.reply(helpMessage);
    } catch (error) {
      logger.error('Failed to show help message:', error);
      await ctx.reply('显示帮助信息时出错，请稍后再试。');
    }
  }

  /**
   * 处理进程终止信号
   */
  private handleProcessSignals(): void {
    process.once('SIGINT', async () => {
      logger.info('Received SIGINT signal, shutting down...');
      await this.stop();
      process.exit(0);
    });

    process.once('SIGTERM', async () => {
      logger.info('Received SIGTERM signal, shutting down...');
      await this.stop();
      process.exit(0);
    });
  }

  /**
   * 获取机器人运行状态
   */
  public getStatus(): {
    isRunning: boolean;
    monitorStatus: ReturnType<MessageMonitor['getStatus']>;
  } {
    return {
      isRunning: this.isRunning,
      monitorStatus: this.messageMonitor.getStatus(),
    };
  }
}

export default Bot;