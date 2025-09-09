import { PrismaClient } from '../../generated/prisma';
/**
 * 数据库连接管理器，提供单例模式的Prisma客户端实例
 */
export declare class DatabaseManager {
    private static instance;
    private prisma;
    private isConnected;
    /**
     * 私有构造函数，防止外部直接实例化
     */
    private constructor();
    /**
     * 获取DatabaseManager的单例实例
     */
    static getInstance(): DatabaseManager;
    /**
     * 连接到数据库
     */
    connect(): Promise<void>;
    /**
     * 断开数据库连接
     */
    disconnect(): Promise<void>;
    /**
     * 获取Prisma客户端实例
     */
    getClient(): PrismaClient;
    /**
     * 检查数据库连接状态
     */
    getConnectionStatus(): boolean;
}
export declare const dbManager: DatabaseManager;
export default dbManager;
//# sourceMappingURL=db.d.ts.map