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
export declare class Logger {
    private readonly config;
    private readonly levelOrder;
    constructor(config?: Partial<LoggerConfig>);
    /**
     * 检查给定的日志级别是否应该被记录
     */
    private shouldLog;
    /**
     * 格式化日志消息
     */
    private formatMessage;
    /**
     * 记录debug级别的日志
     */
    debug(message: string, ...args: any[]): void;
    /**
     * 记录info级别的日志
     */
    info(message: string, ...args: any[]): void;
    /**
     * 记录warn级别的日志
     */
    warn(message: string, ...args: any[]): void;
    /**
     * 记录error级别的日志
     */
    error(message: string, ...args: any[]): void;
    /**
     * 设置日志级别
     */
    setLevel(level: LogLevel): void;
    /**
     * 启用或禁用时间戳显示
     */
    setShowTimestamp(show: boolean): void;
    /**
     * 启用或禁用日志级别显示
     */
    setShowLevel(show: boolean): void;
}
export declare const logger: Logger;
export default logger;
//# sourceMappingURL=logger.d.ts.map