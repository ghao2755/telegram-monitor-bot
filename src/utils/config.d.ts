export interface Config {
    botToken: string;
    pollingInterval: number;
    databaseUrl: string;
}
/**
 * 配置管理器，负责读取和提供环境变量配置
 */
export declare class ConfigManager {
    private readonly config;
    constructor();
    /**
     * 验证配置是否有效
     */
    private validateConfig;
    /**
     * 获取完整配置
     */
    getConfig(): Config;
    /**
     * 获取Telegram Bot Token
     */
    getBotToken(): string;
    /**
     * 获取轮询间隔（毫秒）
     */
    getPollingInterval(): number;
    /**
     * 获取数据库连接URL
     */
    getDatabaseUrl(): string;
}
export declare const configManager: ConfigManager;
export default configManager;
//# sourceMappingURL=config.d.ts.map