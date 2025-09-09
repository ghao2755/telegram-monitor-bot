/**
 * 日志工具类
 */
export class Logger {
    config;
    levelOrder = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3,
    };
    constructor(config = {}) {
        this.config = {
            level: config.level || 'info',
            showTimestamp: config.showTimestamp !== false,
            showLevel: config.showLevel !== false,
        };
    }
    /**
     * 检查给定的日志级别是否应该被记录
     */
    shouldLog(level) {
        return this.levelOrder[level] >= this.levelOrder[this.config.level];
    }
    /**
     * 格式化日志消息
     */
    formatMessage(level, message) {
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
    debug(message, ...args) {
        if (this.shouldLog('debug')) {
            console.debug(this.formatMessage('debug', message), ...args);
        }
    }
    /**
     * 记录info级别的日志
     */
    info(message, ...args) {
        if (this.shouldLog('info')) {
            console.info(this.formatMessage('info', message), ...args);
        }
    }
    /**
     * 记录warn级别的日志
     */
    warn(message, ...args) {
        if (this.shouldLog('warn')) {
            console.warn(this.formatMessage('warn', message), ...args);
        }
    }
    /**
     * 记录error级别的日志
     */
    error(message, ...args) {
        if (this.shouldLog('error')) {
            console.error(this.formatMessage('error', message), ...args);
        }
    }
    /**
     * 设置日志级别
     */
    setLevel(level) {
        this.config.level = level;
    }
    /**
     * 启用或禁用时间戳显示
     */
    setShowTimestamp(show) {
        this.config.showTimestamp = show;
    }
    /**
     * 启用或禁用日志级别显示
     */
    setShowLevel(show) {
        this.config.showLevel = show;
    }
}
// 导出默认的Logger实例
export const logger = new Logger();
export default logger;
//# sourceMappingURL=logger.js.map