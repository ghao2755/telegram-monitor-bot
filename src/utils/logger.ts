/**
 * 日志工具，用于记录应用程序的各种事件和错误
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 日志配置接口
 */
export interface LoggerConfig {
  level: LogLevel;
  showTimestamp: boolean;
  showLevel: boolean;
}

/**
 * 日志工具类
 */
export class Logger {
  private readonly config: LoggerConfig;
  private readonly levelOrder: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: config.level || 'info',
      showTimestamp: config.showTimestamp !== false,
      showLevel: config.showLevel !== false,
    };
  }

  /**
   * 检查给定的日志级别是否应该被记录
   */
  private shouldLog(level: LogLevel): boolean {
    return this.levelOrder[level] >= this.levelOrder[this.config.level];
  }

  /**
   * 格式化日志消息
   */
  private formatMessage(level: LogLevel, message: string): string {
    let formatted = '';

    if (this.config.showTimestamp) {
      formatted += `[${new Date().toISOString()}] `;
    }

    if (this.config.showLevel) {
      formatted += `[${level.toUpperCase()}] `;
    }

    formatted += message;

    return formatted;
  }

  /**
   * 记录debug级别的日志
   */
  public debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message), ...args);
    }
  }

  /**
   * 记录info级别的日志
   */
  public info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message), ...args);
    }
  }

  /**
   * 记录warn级别的日志
   */
  public warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message), ...args);
    }
  }

  /**
   * 记录error级别的日志
   */
  public error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message), ...args);
    }
  }

  /**
   * 设置日志级别
   */
  public setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * 启用或禁用时间戳显示
   */
  public setShowTimestamp(show: boolean): void {
    this.config.showTimestamp = show;
  }

  /**
   * 启用或禁用日志级别显示
   */
  public setShowLevel(show: boolean): void {
    this.config.showLevel = show;
  }
}

// 导出默认的Logger实例
export const logger = new Logger();

export default logger;