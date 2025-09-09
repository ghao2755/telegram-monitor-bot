import { PrismaClient } from '../../generated/prisma';
import logger from './logger';

/**
 * 数据库连接管理器，提供单例模式的Prisma客户端实例
 */
export class DatabaseManager {
  private static instance: DatabaseManager;
  private prisma: PrismaClient;
  private isConnected: boolean = false;

  /**
   * 私有构造函数，防止外部直接实例化
   */
  private constructor() {
    this.prisma = new PrismaClient({
      log: [
        'error',
        'warn',
        'info',
      ],
    });
  }

  /**
   * 获取DatabaseManager的单例实例
   */
  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * 连接到数据库
   */
  public async connect(): Promise<void> {
    if (!this.isConnected) {
      try {
        await this.prisma.$connect();
        this.isConnected = true;
        logger.info('Database connection established');
      } catch (error) {
        logger.error('Failed to connect to database', error);
        throw error;
      }
    }
  }

  /**
   * 断开数据库连接
   */
  public async disconnect(): Promise<void> {
    if (this.isConnected) {
      try {
        await this.prisma.$disconnect();
        this.isConnected = false;
        logger.info('Database connection closed');
      } catch (error) {
        logger.error('Failed to disconnect from database', error);
        throw error;
      }
    }
  }

  /**
   * 获取Prisma客户端实例
   */
  public getClient(): PrismaClient {
    return this.prisma;
  }

  /**
   * 检查数据库连接状态
   */
  public getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

// 导出单例实例
export const dbManager = DatabaseManager.getInstance();

export default dbManager;