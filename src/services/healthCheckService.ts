/**
 * 健康检查服务，用于监控机器人状态和发送异常警报
 */
import { Telegraf } from 'telegraf';
import * as cron from 'node-cron';
import logger from '../utils/logger';
import dbManager from '../utils/db';

/**
 * 健康检查状态枚举
 */
export enum HealthCheckStatus {
  OK = 'OK',
  WARNING = 'WARNING',
  ERROR = 'ERROR'
}

/**
 * 健康检查结果接口
 */
export interface HealthCheckResult {
  status: HealthCheckStatus;
  message: string;
  details?: Record<string, any>;
  timestamp: Date;
}

/**
 * 健康检查服务
 */
export class HealthCheckService {
  private bot: Telegraf | null = null;
  private alertChatIds: string[] = [];
  private isRunning: boolean = false;
  private cronTask: any = null;
  private prisma = dbManager.getClient();

  constructor() {
    // 默认每10分钟执行一次健康检查
    this.startHealthChecks('*/10 * * * *');
  }

  /**
   * 设置Telegraf机器人实例
   */
  public setBot(bot: Telegraf): void {
    this.bot = bot;
  }

  /**
   * 添加警报接收者的聊天ID
   */
  public addAlertChatId(chatId: string): void {
    if (!this.alertChatIds.includes(chatId)) {
      this.alertChatIds.push(chatId);
      logger.info(`Added alert chat ID: ${chatId}`);
    }
  }

  /**
   * 移除警报接收者的聊天ID
   */
  public removeAlertChatId(chatId: string): void {
    const index = this.alertChatIds.indexOf(chatId);
    if (index > -1) {
      this.alertChatIds.splice(index, 1);
      logger.info(`Removed alert chat ID: ${chatId}`);
    }
  }

  /**
   * 获取所有警报接收者的聊天ID
   */
  public getAlertChatIds(): string[] {
    return [...this.alertChatIds];
  }

  /**
   * 启动健康检查
   */
  public startHealthCheck(): void {
    this.startHealthChecks();
  }

  /**
   * 停止健康检查
   */
  public stopHealthCheck(): void {
    this.stopHealthChecks();
  }

  /**
   * 启动健康检查调度任务
   */
  public startHealthChecks(cronExpression: string = '*/10 * * * *'): void {
    if (this.isRunning) {
      logger.warn('Health check service is already running');
      return;
    }

    try {
      this.cronTask = cron.schedule(cronExpression, async () => {
        await this.performHealthCheck();
      });
      
      this.isRunning = true;
      logger.info(`Health check service started with schedule: ${cronExpression}`);
    } catch (error) {
      logger.error('Failed to start health check service:', error);
    }
  }

  /**
   * 停止健康检查调度任务
   */
  public stopHealthChecks(): void {
    if (!this.isRunning || !this.cronTask) {
      logger.warn('Health check service is not running');
      return;
    }

    try {
      this.cronTask.stop();
      this.isRunning = false;
      logger.info('Health check service stopped');
    } catch (error) {
      logger.error('Failed to stop health check service:', error);
    }
  }

  /**
   * 执行健康检查
   */
  public async performHealthCheck(): Promise<HealthCheckResult> {
    const results: HealthCheckResult[] = [];
    
    try {
      // 检查数据库连接
      const dbResult = await this.checkDatabaseConnection();
      results.push(dbResult);
      
      // 检查机器人状态
      const botResult = await this.checkBotStatus();
      results.push(botResult);
      
      // 检查源群组配置
      const sourceGroupsResult = await this.checkSourceGroups();
      results.push(sourceGroupsResult);
      
      // 检查目标群组配置
      const targetGroupsResult = await this.checkTargetGroups();
      results.push(targetGroupsResult);
      
      // 确定整体状态
      const overallStatus = this.determineOverallStatus(results);
      
      // 记录健康检查结果
      await this.recordHealthCheckResult(overallStatus);
      
      // 如果状态为ERROR或WARNING，发送警报
      if (overallStatus.status !== HealthCheckStatus.OK && this.alertChatIds.length > 0) {
        await this.sendAlert(overallStatus);
      }
      
      return overallStatus;
    } catch (error) {
      logger.error('Health check failed:', error);
      
      const errorResult: HealthCheckResult = {
        status: HealthCheckStatus.ERROR,
        message: 'Health check process failed',
        details: { error: error instanceof Error ? error.message : String(error) },
        timestamp: new Date()
      };
      
      // 记录错误结果
      await this.recordHealthCheckResult(errorResult);
      
      // 发送警报
      if (this.alertChatIds.length > 0) {
        await this.sendAlert(errorResult);
      }
      
      return errorResult;
    }
  }

  /**
   * 检查数据库连接
   */
  private async checkDatabaseConnection(): Promise<HealthCheckResult> {
    try {
      const startTime = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - startTime;
      
      return {
        status: HealthCheckStatus.OK,
        message: 'Database connection is healthy',
        details: { responseTime },
        timestamp: new Date()
      };
    } catch (error) {
      return {
        status: HealthCheckStatus.ERROR,
        message: 'Database connection failed',
        details: { error: error instanceof Error ? error.message : String(error) },
        timestamp: new Date()
      };
    }
  }

  /**
   * 检查机器人状态
   */
  private async checkBotStatus(): Promise<HealthCheckResult> {
    try {
      if (!this.bot) {
        return {
          status: HealthCheckStatus.WARNING,
          message: 'Bot instance not configured',
          timestamp: new Date()
        };
      }
      
      // 在实际实现中，可以添加更复杂的机器人状态检查
      // 例如检查API连接性、最后一条消息的处理时间等
      
      return {
        status: HealthCheckStatus.OK,
        message: 'Bot is running',
        timestamp: new Date()
      };
    } catch (error) {
      return {
        status: HealthCheckStatus.ERROR,
        message: 'Bot status check failed',
        details: { error: error instanceof Error ? error.message : String(error) },
        timestamp: new Date()
      };
    }
  }

  /**
   * 检查源群组配置
   */
  private async checkSourceGroups(): Promise<HealthCheckResult> {
    try {
      const sourceGroups = await this.prisma.sourceGroup.findMany();
      
      if (sourceGroups.length === 0) {
        return {
          status: HealthCheckStatus.WARNING,
          message: 'No source groups configured',
          details: { count: 0 },
          timestamp: new Date()
        };
      }
      
      return {
        status: HealthCheckStatus.OK,
        message: `Source groups configuration is healthy`,
        details: { count: sourceGroups.length },
        timestamp: new Date()
      };
    } catch (error) {
      return {
        status: HealthCheckStatus.ERROR,
        message: 'Failed to check source groups',
        details: { error: error instanceof Error ? error.message : String(error) },
        timestamp: new Date()
      };
    }
  }

  /**
   * 检查目标群组配置
   */
  private async checkTargetGroups(): Promise<HealthCheckResult> {
    try {
      const targetGroups = await this.prisma.targetGroup.findMany();
      
      if (targetGroups.length === 0) {
        return {
          status: HealthCheckStatus.WARNING,
          message: 'No target groups configured',
          details: { count: 0 },
          timestamp: new Date()
        };
      }
      
      return {
        status: HealthCheckStatus.OK,
        message: `Target groups configuration is healthy`,
        details: { count: targetGroups.length },
        timestamp: new Date()
      };
    } catch (error) {
      return {
        status: HealthCheckStatus.ERROR,
        message: 'Failed to check target groups',
        details: { error: error instanceof Error ? error.message : String(error) },
        timestamp: new Date()
      };
    }
  }

  /**
   * 根据各部分检查结果确定整体状态
   */
  private determineOverallStatus(results: HealthCheckResult[]): HealthCheckResult {
    // 如果有任何ERROR状态，整体状态为ERROR
    if (results.some(r => r.status === HealthCheckStatus.ERROR)) {
      return {
        status: HealthCheckStatus.ERROR,
        message: 'Some components are in error state',
        details: results,
        timestamp: new Date()
      };
    }
    
    // 如果没有ERROR但有WARNING，整体状态为WARNING
    if (results.some(r => r.status === HealthCheckStatus.WARNING)) {
      return {
        status: HealthCheckStatus.WARNING,
        message: 'Some components need attention',
        details: results,
        timestamp: new Date()
      };
    }
    
    // 所有组件都正常
    return {
      status: HealthCheckStatus.OK,
      message: 'All components are healthy',
      details: results,
      timestamp: new Date()
    };
  }

  /**
   * 记录健康检查结果到数据库
   */
  private async recordHealthCheckResult(result: HealthCheckResult): Promise<void> {
    try {
      // 构建数据对象，仅当details存在时才包含该字段
      const data: any = {
        status: result.status,
        message: result.message
      };
      
      if (result.details) {
        data.details = JSON.stringify(result.details);
      }
      
      await this.prisma.healthCheck.create({
        data
      });
    } catch (error) {
      logger.error('Failed to record health check result:', error);
      // 记录失败不应影响主流程
    }
  }

  /**
   * 发送警报消息
   */
  private async sendAlert(result: HealthCheckResult): Promise<void> {
    if (!this.bot) {
      logger.error('Cannot send alert: Bot instance not configured');
      return;
    }

    try {
      let statusEmoji = '🟢'; // 默认OK
      if (result.status === HealthCheckStatus.WARNING) {
        statusEmoji = '🟡';
      } else if (result.status === HealthCheckStatus.ERROR) {
        statusEmoji = '🔴';
      }
      
      const alertMessage = `${statusEmoji} 机器人健康检查警报\n\n` +
        `状态: ${result.status}\n` +
        `消息: ${result.message}\n` +
        `时间: ${result.timestamp.toLocaleString()}\n\n` +
        `详情请查看完整日志。`;
      
      for (const chatId of this.alertChatIds) {
        try {
          await this.bot.telegram.sendMessage(chatId, alertMessage);
          logger.info(`Alert sent to chat ${chatId}`);
        } catch (error) {
          logger.error(`Failed to send alert to chat ${chatId}:`, error);
          // 继续尝试发送给其他接收者
        }
      }
    } catch (error) {
      logger.error('Failed to send alerts:', error);
    }
  }

  /**
   * 获取最近的健康检查记录
   */
  public async getRecentHealthChecks(limit: number = 10): Promise<HealthCheckResult[]> {
    try {
      const records = await this.prisma.healthCheck.findMany({
        orderBy: {
          timestamp: 'desc'
        },
        take: limit
      });
      
      return records.map(record => ({
        status: record.status as HealthCheckStatus,
        message: record.message || 'No message',
        details: record.details ? JSON.parse(record.details as string) : undefined,
        timestamp: record.timestamp
      }));
    } catch (error) {
      logger.error('Failed to get recent health checks:', error);
      return [];
    }
  }

  /**
   * 获取健康检查服务状态
   */
  public getStatus(): {
    isRunning: boolean;
    alertRecipients: number;
  } {
    return {
      isRunning: this.isRunning,
      alertRecipients: this.alertChatIds.length
    };
  }
}

export default new HealthCheckService();