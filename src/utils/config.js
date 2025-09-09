import dotenv from 'dotenv';
dotenv.config();
/**
 * 配置管理器，负责读取和提供环境变量配置
 */
export class ConfigManager {
    config;
    constructor() {
        this.config = {
            botToken: process.env.BOT_TOKEN || '',
            pollingInterval: parseInt(process.env.POLLING_INTERVAL || '5000', 10),
            databaseUrl: process.env.DATABASE_URL || '',
        };
        this.validateConfig();
    }
    /**
     * 验证配置是否有效
     */
    validateConfig() {
        if (!this.config.botToken) {
            console.warn('Warning: BOT_TOKEN is not set in .env file');
        }
        if (this.config.pollingInterval < 1000) {
            console.warn('Warning: POLLING_INTERVAL is too low, setting to 1000ms');
            this.config.pollingInterval = 1000;
        }
        if (!this.config.databaseUrl) {
            throw new Error('DATABASE_URL is not set in .env file');
        }
    }
    /**
     * 获取完整配置
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * 获取Telegram Bot Token
     */
    getBotToken() {
        return this.config.botToken;
    }
    /**
     * 获取轮询间隔（毫秒）
     */
    getPollingInterval() {
        return this.config.pollingInterval;
    }
    /**
     * 获取数据库连接URL
     */
    getDatabaseUrl() {
        return this.config.databaseUrl;
    }
}
// 导出单例实例
export const configManager = new ConfigManager();
export default configManager;
//# sourceMappingURL=config.js.map