/**
 * API速率限制跟踪服务，用于监控Telegram API调用频率和限制
 */
import logger from '../utils/logger';
import dbManager from '../utils/db';

/**
 * API调用记录接口
 */
export interface ApiCallRecord {
  timestamp: Date;
  method: string;
  success: boolean;
  responseTime: number;
  errorMessage?: string | undefined;
}

/**
 * 速率限制状态接口
 */
export interface RateLimitStatus {
  method: string;
  recentCalls: number;
  averageResponseTime: number;
  successRate: number;
  lastError?: string;
  lastErrorTime?: Date;
}

/**
 * API速率限制跟踪服务
 */
export class ApiRateLimiter {
  private prisma = dbManager.getClient();
  private callHistory: Map<string, ApiCallRecord[]> = new Map();
  private maxHistorySize = 1000; // 保存的最大历史记录数
  private windowSizeMs = 60000; // 统计窗口大小（毫秒）
  private isMonitoring = false;

  /**
   * 记录API调用
   */
  public async recordApiCall(method: string, success: boolean, responseTime: number, errorMessage?: string | null): Promise<void> {
    const callRecord: ApiCallRecord = {
      timestamp: new Date(),
      method,
      success,
      responseTime,
      errorMessage: errorMessage || undefined
    };

    try {
      // 更新内存中的历史记录
      this.updateMemoryHistory(callRecord);

      // 异步记录到数据库
      this.recordToDatabase(callRecord).catch(err => {
        logger.error('Failed to record API call to database:', err);
        // 数据库记录失败不应影响主流程
      });

    } catch (error) {
      logger.error('Failed to record API call:', error);
      // 记录失败不应影响主流程
    }
  }

  /**
   * 更新内存中的调用历史
   */
  private updateMemoryHistory(record: ApiCallRecord): void {
    if (!this.callHistory.has(record.method)) {
      this.callHistory.set(record.method, []);
    }

    const methodHistory = this.callHistory.get(record.method)!;
    methodHistory.push(record);

    // 保持历史记录不超过最大大小
    if (methodHistory.length > this.maxHistorySize) {
      methodHistory.splice(0, methodHistory.length - this.maxHistorySize);
    }

    // 移除超出时间窗口的记录
    const cutoffTime = Date.now() - this.windowSizeMs;
    const filteredHistory = methodHistory.filter(r => r.timestamp.getTime() > cutoffTime);
    this.callHistory.set(record.method, filteredHistory);
  }

  /**
   * 将API调用记录保存到数据库
   */
  private async recordToDatabase(record: ApiCallRecord): Promise<void> {
    try {
      await this.prisma.apiUsage.create({
        data: {
          method: record.method,
          success: record.success,
          responseTime: record.responseTime,
          errorMessage: record.errorMessage ?? null
        }
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * 获取特定API方法的速率限制状态
   */
  public getRateLimitStatus(method: string): RateLimitStatus {
    const methodHistory = this.callHistory.get(method) || [];
    const now = Date.now();
    const windowCutoff = now - this.windowSizeMs;

    // 只考虑时间窗口内的记录
    const recentCalls = methodHistory.filter(r => r.timestamp.getTime() > windowCutoff);
    
    if (recentCalls.length === 0) {
      return {
        method,
        recentCalls: 0,
        averageResponseTime: 0,
        successRate: 100
      };
    }

    // 计算成功调用数
    const successfulCalls = recentCalls.filter(r => r.success).length;
    const successRate = (successfulCalls / recentCalls.length) * 100;

    // 计算平均响应时间
    const totalResponseTime = recentCalls.reduce((sum, call) => sum + call.responseTime, 0);
    const averageResponseTime = totalResponseTime / recentCalls.length;

    // 查找最近的错误
    const errors = recentCalls.filter(r => !r.success);
    let lastError: string | undefined;
    let lastErrorTime: Date | undefined;

    if (errors.length > 0) {
      // 按时间排序，取最后一个错误
      const lastErrorRecord = errors.sort((a, b) => 
        b.timestamp.getTime() - a.timestamp.getTime()
      )[0];
      
      if (lastErrorRecord) {
        lastError = lastErrorRecord.errorMessage;
        lastErrorTime = lastErrorRecord.timestamp;
      } else {
        lastError = undefined;
        lastErrorTime = undefined;
      }
    }

    return {
      method,
      recentCalls: recentCalls.length,
      averageResponseTime,
      successRate,
      lastError: lastError || undefined,
      lastErrorTime: lastErrorTime || undefined
    } as RateLimitStatus;
  }

  /**
   * 获取所有API方法的速率限制状态
   */
  public getAllRateLimitStatuses(): RateLimitStatus[] {
    const statuses: RateLimitStatus[] = [];
    
    for (const method of this.callHistory.keys()) {
      statuses.push(this.getRateLimitStatus(method));
    }
    
    return statuses;
  }

  /**
   * 开始监控API调用
   */
  public startMonitoring(): void {
    if (!this.isMonitoring) {
      this.isMonitoring = true;
      logger.info('API rate monitoring started');
    }
  }

  /**
   * 停止监控API调用
   */
  public stopMonitoring(): void {
    if (this.isMonitoring) {
      this.isMonitoring = false;
      logger.info('API rate monitoring stopped');
    }
  }

  /**
   * 获取API使用统计报告文本
   */
  public generateApiUsageReport(): string {
    const statuses = this.getAllRateLimitStatuses();
    
    if (statuses.length === 0) {
      return '📊 API调用统计：暂无数据';
    }

    let report = '📊 API调用统计报告\n\n';
    report += `时间窗口：最近 ${this.windowSizeMs / 1000} 秒\n\n`;

    // 按调用次数排序
    const sortedStatuses = statuses.sort((a, b) => b.recentCalls - a.recentCalls);
    
    for (const status of sortedStatuses) {
      const successEmoji = status.successRate === 100 ? '✅' : 
                          status.successRate > 80 ? '⚠️' : '❌';
      
      report += `${successEmoji} ${status.method}\n`;
      report += `- 调用次数: ${status.recentCalls}\n`;
      report += `- 成功率: ${status.successRate.toFixed(1)}%\n`;
      report += `- 平均响应时间: ${status.averageResponseTime.toFixed(1)}ms\n`;
      
      if (status.lastError) {
        report += `- 最近错误: ${status.lastError.substring(0, 50)}...\n`;
      }
      
      report += '\n';
    }

    return report;
  }

  /**
   * 检查是否应该限制某个API方法的调用
   */
  public shouldLimitCall(method: string): boolean {
    const status = this.getRateLimitStatus(method);
    
    // 示例限制规则：
    // 1. 如果在时间窗口内调用次数超过阈值，则限制
    // 2. 如果成功率低于阈值，则限制
    
    const CALL_LIMIT = 30; // 时间窗口内的最大调用次数
    const MIN_SUCCESS_RATE = 50; // 最小成功率
    
    if (status.recentCalls > CALL_LIMIT) {
      logger.warn(`Rate limiting ${method}: too many calls (${status.recentCalls} > ${CALL_LIMIT})`);
      return true;
    }
    
    if (status.successRate < MIN_SUCCESS_RATE && status.recentCalls > 5) {
      logger.warn(`Rate limiting ${method}: low success rate (${status.successRate.toFixed(1)}% < ${MIN_SUCCESS_RATE}%)`);
      return true;
    }
    
    return false;
  }

  /**
   * 获取服务状态
   */
  public getStatus(): {
    trackedMethods: number;
    totalCalls: number;
    windowSizeSeconds: number;
    maxHistorySize: number;
  } {
    let totalCalls = 0;
    
    for (const history of this.callHistory.values()) {
      totalCalls += history.length;
    }
    
    return {
      trackedMethods: this.callHistory.size,
      totalCalls,
      windowSizeSeconds: this.windowSizeMs / 1000,
      maxHistorySize: this.maxHistorySize
    };
  }

  /**
   * 清除内存中的历史记录
   */
  public clearHistory(): void {
    this.callHistory.clear();
    logger.info('API rate limiter history cleared');
  }

  /**
   * 设置时间窗口大小（毫秒）
   */
  public setWindowSize(windowSizeMs: number): void {
    if (windowSizeMs > 0) {
      this.windowSizeMs = windowSizeMs;
      logger.info(`API rate limiter window size set to ${windowSizeMs}ms`);
    } else {
      logger.warn('Invalid window size, must be greater than 0');
    }
  }

  /**
   * 设置最大历史记录数
   */
  public setMaxHistorySize(maxSize: number): void {
    if (maxSize > 0) {
      this.maxHistorySize = maxSize;
      logger.info(`API rate limiter max history size set to ${maxSize}`);
      
      // 调整现有历史记录大小
      for (const [method, history] of this.callHistory.entries()) {
        if (history.length > maxSize) {
          this.callHistory.set(method, history.slice(-maxSize));
        }
      }
    } else {
      logger.warn('Invalid max history size, must be greater than 0');
    }
  }
}

export default new ApiRateLimiter();