/**
 * 统计服务，用于收集和管理转发统计数据
 */
import logger from '../utils/logger';
import dbManager from '../utils/db';

/**
 * 转发统计数据接口
 */
export interface ForwardingStats {
  date: Date;
  forwardedCount: number;
  failedCount: number;
  blockedByFilterCount: number;
}

/**
 * 统计服务
 */
export class StatsService {
  private prisma = dbManager.getClient();

  /**
   * 记录一条转发成功的消息
   */
  public async recordForwardedMessage(): Promise<void> {
    try {
      const today = this.getTodayDate();
      
      // 尝试更新今天的统计记录，如果不存在则创建
      await this.prisma.forwardingStats.upsert({
        where: {
          date: today
        },
        update: {
          forwardedCount: { increment: 1 },
          updatedAt: new Date()
        },
        create: {
          date: today,
          forwardedCount: 1
        }
      });
    } catch (error) {
      logger.error('Failed to record forwarded message stats:', error);
      // 统计失败不应影响主流程
    }
  }

  /**
   * 记录一条转发失败的消息
   */
  public async recordFailedMessage(): Promise<void> {
    try {
      const today = this.getTodayDate();
      
      // 尝试更新今天的统计记录，如果不存在则创建
      await this.prisma.forwardingStats.upsert({
        where: {
          date: today
        },
        update: {
          failedCount: { increment: 1 },
          updatedAt: new Date()
        },
        create: {
          date: today,
          failedCount: 1
        }
      });
    } catch (error) {
      logger.error('Failed to record failed message stats:', error);
      // 统计失败不应影响主流程
    }
  }

  /**
   * 记录一条被过滤器阻止的消息
   */
  public async recordBlockedMessage(): Promise<void> {
    try {
      const today = this.getTodayDate();
      
      // 尝试更新今天的统计记录，如果不存在则创建
      await this.prisma.forwardingStats.upsert({
        where: {
          date: today
        },
        update: {
          blockedByFilterCount: { increment: 1 },
          updatedAt: new Date()
        },
        create: {
          date: today,
          blockedByFilterCount: 1
        }
      });
    } catch (error) {
      logger.error('Failed to record blocked message stats:', error);
      // 统计失败不应影响主流程
    }
  }

  /**
   * 获取指定日期范围的统计数据
   */
  public async getStatsForPeriod(startDate: Date, endDate: Date): Promise<ForwardingStats[]> {
    try {
      const stats = await this.prisma.forwardingStats.findMany({
        where: {
          date: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: {
          date: 'asc'
        }
      });
      
      return stats.map(s => ({
        date: s.date,
        forwardedCount: s.forwardedCount,
        failedCount: s.failedCount,
        blockedByFilterCount: s.blockedByFilterCount
      }));
    } catch (error) {
      logger.error('Failed to get stats for period:', error);
      return [];
    }
  }

  /**
   * 获取今天的统计数据
   */
  public async getTodayStats(): Promise<ForwardingStats | null> {
    try {
      const today = this.getTodayDate();
      const stats = await this.prisma.forwardingStats.findUnique({
        where: {
          date: today
        }
      });
      
      if (!stats) {
        return null;
      }
      
      return {
        date: stats.date,
        forwardedCount: stats.forwardedCount,
        failedCount: stats.failedCount,
        blockedByFilterCount: stats.blockedByFilterCount
      };
    } catch (error) {
      logger.error('Failed to get today stats:', error);
      return null;
    }
  }

  /**
   * 获取昨天的统计数据
   */
  public async getYesterdayStats(): Promise<ForwardingStats | null> {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      
      const stats = await this.prisma.forwardingStats.findUnique({
        where: {
          date: yesterday
        }
      });
      
      if (!stats) {
        return null;
      }
      
      return {
        date: stats.date,
        forwardedCount: stats.forwardedCount,
        failedCount: stats.failedCount,
        blockedByFilterCount: stats.blockedByFilterCount
      };
    } catch (error) {
      logger.error('Failed to get yesterday stats:', error);
      return null;
    }
  }

  /**
   * 获取本周的统计数据
   */
  public async getThisWeekStats(): Promise<ForwardingStats[]> {
    try {
      const today = new Date();
      const firstDayOfWeek = new Date(today);
      const dayOfWeek = today.getDay() || 7; // 将周日视为一周的第7天
      firstDayOfWeek.setDate(today.getDate() - (dayOfWeek - 1));
      firstDayOfWeek.setHours(0, 0, 0, 0);
      
      const endOfWeek = new Date(firstDayOfWeek);
      endOfWeek.setDate(firstDayOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);
      
      return await this.getStatsForPeriod(firstDayOfWeek, endOfWeek);
    } catch (error) {
      logger.error('Failed to get this week stats:', error);
      return [];
    }
  }

  /**
   * 生成统计报告文本
   */
  public async generateStatsReportText(): Promise<string> {
    try {
      const todayStats = await this.getTodayStats();
      const yesterdayStats = await this.getYesterdayStats();
      const weekStats = await this.getThisWeekStats();
      
      let report = '📊 转发统计报告\n\n';
      
      // 今天的统计
      if (todayStats) {
        report += `📅 今日统计\n`;
        report += `- 成功转发: ${todayStats.forwardedCount}\n`;
        report += `- 转发失败: ${todayStats.failedCount}\n`;
        report += `- 被过滤阻止: ${todayStats.blockedByFilterCount}\n\n`;
      } else {
        report += `📅 今日统计: 暂无数据\n\n`;
      }
      
      // 昨天的统计
      if (yesterdayStats) {
        report += `📆 昨日统计\n`;
        report += `- 成功转发: ${yesterdayStats.forwardedCount}\n`;
        report += `- 转发失败: ${yesterdayStats.failedCount}\n`;
        report += `- 被过滤阻止: ${yesterdayStats.blockedByFilterCount}\n\n`;
      }
      
      // 本周统计
      if (weekStats.length > 0) {
        const weekTotalForwarded = weekStats.reduce((sum, day) => sum + day.forwardedCount, 0);
        const weekTotalFailed = weekStats.reduce((sum, day) => sum + day.failedCount, 0);
        const weekTotalBlocked = weekStats.reduce((sum, day) => sum + day.blockedByFilterCount, 0);
        
        report += `📋 本周统计\n`;
        report += `- 成功转发: ${weekTotalForwarded}\n`;
        report += `- 转发失败: ${weekTotalFailed}\n`;
        report += `- 被过滤阻止: ${weekTotalBlocked}\n`;
      }
      
      return report;
    } catch (error) {
      logger.error('Failed to generate stats report:', error);
      return '生成统计报告时出错，请稍后再试。';
    }
  }

  /**
   * 获取今天的日期（不含时间部分）
   */
  private getTodayDate(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }
}

export default new StatsService();