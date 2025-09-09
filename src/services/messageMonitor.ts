import { Telegraf } from 'telegraf';
import * as cron from 'node-cron';
import configManager from '../utils/config';
import logger from '../utils/logger';
import dbManager from '../utils/db';

/**
 * 消息监控服务，负责定期检查源群组的新消息
 */
export class MessageMonitor {
  private bot: Telegraf;
  private pollingInterval: number;
  private lastMessageIds: Map<string, number> = new Map();
  private isRunning: boolean = false;
  private cronTask: cron.ScheduledTask | null = null;

  constructor(bot: Telegraf) {
    this.bot = bot;
    this.pollingInterval = configManager.getPollingInterval();
  }

  /**
   * 启动消息监控服务
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn('Message monitor is already running');
      return;
    }

    // 计算cron表达式，基于配置的轮询间隔（毫秒）
    const seconds = Math.floor(this.pollingInterval / 1000);
    const cronExpression = `*/${seconds} * * * * *`; // 每X秒执行一次

    this.cronTask = cron.schedule(cronExpression, async () => {
      await this.checkNewMessages();
    });

    this.isRunning = true;
    logger.info(`Message monitor started with polling interval of ${this.pollingInterval}ms`);
  }

  /**
   * 停止消息监控服务
   */
  public stop(): void {
    if (!this.isRunning || !this.cronTask) {
      logger.warn('Message monitor is not running');
      return;
    }

    this.cronTask.stop();
    this.isRunning = false;
    logger.info('Message monitor stopped');
  }

  /**
   * 检查源群组的新消息
   */
  private async checkNewMessages(): Promise<void> {
    try {
      const prisma = dbManager.getClient();
      const sourceGroups = await prisma.sourceGroup.findMany();

      if (sourceGroups.length === 0) {
        logger.debug('No source groups configured for monitoring');
        return;
      }

      for (const sourceGroup of sourceGroups) {
        try {
          await this.fetchNewMessagesFromGroup(sourceGroup.chatId);
        } catch (error) {
          logger.error(`Failed to fetch messages from group ${sourceGroup.chatId}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error while checking for new messages:', error);
    }
  }

  /**
   * 从特定群组获取新消息
   */
  private async fetchNewMessagesFromGroup(chatId: string): Promise<void> {
    try {
      // 获取群组的最新消息
      // 注意：在实际使用中，这里需要使用Telegram Bot API来获取消息
      // 由于API限制，我们需要确保遵守速率限制并处理分页
      logger.debug(`Checking for new messages in group ${chatId}`);

      // 这里是一个简化的实现，实际项目中需要完善
      // 这里只是示例代码，实际实现需要通过Telegram API获取消息
      // 然后处理消息转发逻辑

    } catch (error) {
      logger.error(`Error fetching messages from group ${chatId}:`, error);
      // 可以在这里添加重试逻辑
    }
  }

  /**
   * 处理接收到的消息
   */
  public async processMessage(message: any): Promise<void> {
    try {
      if (!message.chat || !message.chat.id) {
        logger.warn('Received message without chat information');
        return;
      }

      const chatId = message.chat.id.toString();
      const messageId = message.message_id;

      // 检查消息是否已经处理过
      const lastProcessedId = this.lastMessageIds.get(chatId) || 0;
      if (messageId <= lastProcessedId) {
        logger.debug(`Skipping already processed message ${messageId} in chat ${chatId}`);
        return;
      }

      // 更新最后处理的消息ID
      this.lastMessageIds.set(chatId, messageId);

      logger.debug(`Processing new message ${messageId} from chat ${chatId}`);

      // 这里将在后续实现中添加消息转发逻辑

    } catch (error) {
      logger.error('Error processing message:', error);
    }
  }

  /**
   * 获取监控服务状态
   */
  public getStatus(): {
    isRunning: boolean;
    pollingInterval: number;
    monitoredGroups: number;
  } {
    return {
      isRunning: this.isRunning,
      pollingInterval: this.pollingInterval,
      monitoredGroups: this.lastMessageIds.size,
    };
  }
}

export default MessageMonitor;