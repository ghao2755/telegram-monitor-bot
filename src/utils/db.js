import { PrismaClient } from '../../generated/prisma';
import logger from './logger';
/**
 * 数据库连接管理器，提供单例模式的Prisma客户端实例
 */
export class DatabaseManager {
    static instance;
    prisma;
    isConnected = false;
    /**
     * 私有构造函数，防止外部直接实例化
     */
    constructor() {
        this.prisma = new PrismaClient({
            log: [
                {
                    emit: 'event',
                    level: 'query',
                },
                {
                    emit: 'event',
                    level: 'error',
                },
                {
                    emit: 'event',
                    level: 'info',
                },
                {
                    emit: 'event',
                    level: 'warn',
                },
            ],
        });
        // 设置日志事件监听器
        this.prisma.$on('query', (e) => {
            logger.debug(`Query: ${e.query} | Duration: ${e.duration}ms`);
        });
        this.prisma.$on('error', (e) => {
            logger.error(`Database error: ${e.message}`);
        });
        this.prisma.$on('info', (e) => {
            logger.info(`Database info: ${e.message}`);
        });
        this.prisma.$on('warn', (e) => {
            logger.warn(`Database warning: ${e.message}`);
        });
    }
    /**
     * 获取DatabaseManager的单例实例
     */
    static getInstance() {
        if (!DatabaseManager.instance) {
            DatabaseManager.instance = new DatabaseManager();
        }
        return DatabaseManager.instance;
    }
    /**
     * 连接到数据库
     */
    async connect() {
        if (!this.isConnected) {
            try {
                await this.prisma.$connect();
                this.isConnected = true;
                logger.info('Database connection established');
            }
            catch (error) {
                logger.error('Failed to connect to database', error);
                throw error;
            }
        }
    }
    /**
     * 断开数据库连接
     */
    async disconnect() {
        if (this.isConnected) {
            try {
                await this.prisma.$disconnect();
                this.isConnected = false;
                logger.info('Database connection closed');
            }
            catch (error) {
                logger.error('Failed to disconnect from database', error);
                throw error;
            }
        }
    }
    /**
     * 获取Prisma客户端实例
     */
    getClient() {
        return this.prisma;
    }
    /**
     * 检查数据库连接状态
     */
    getConnectionStatus() {
        return this.isConnected;
    }
}
// 导出单例实例
export const dbManager = DatabaseManager.getInstance();
export default dbManager;
//# sourceMappingURL=db.js.map