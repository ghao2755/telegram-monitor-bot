/**
 * 消息过滤服务，用于根据关键词过滤消息
 */
import logger from '../utils/logger';

/**
 * 过滤规则类型枚举
 */
export enum FilterType {
  WHITELIST = 'WHITELIST',
  BLACKLIST = 'BLACKLIST'
}

/**
 * 过滤规则接口
 */
export interface FilterRule {
  id: number;
  name: string;
  type: FilterType;
  keywords: string[];
  isEnabled: boolean;
}

/**
 * 消息过滤器服务
 */
export class MessageFilter {
  /**
   * 根据过滤规则检查消息是否应该被转发
   */
  public async shouldForwardMessage(message: any, filterRule: FilterRule | null): Promise<{ shouldForward: boolean; reason?: string | undefined }> {
    try {
      // 如果没有设置过滤规则，默认允许转发
      if (!filterRule || !filterRule.isEnabled || !filterRule.keywords || filterRule.keywords.length === 0) {
        return { shouldForward: true };
      }

      // 获取消息文本内容
      const messageText = this.extractTextFromMessage(message);
      
      if (!messageText) {
        // 没有文本内容的消息（如纯图片、视频等）
        // 根据过滤类型决定是否转发
        if (filterRule.type === FilterType.WHITELIST) {
          // 白名单模式下，没有文本的消息默认不转发
          return { shouldForward: false, reason: 'No text content in whitelist mode' as string };
        }
        return { shouldForward: true };
      }

      // 检查消息是否包含关键词
      const containsKeyword = this.checkKeywords(messageText, filterRule.keywords);

      // 根据过滤类型决定是否转发
      if (filterRule.type === FilterType.WHITELIST) {
        // 白名单模式：只有包含关键词的消息才转发
        return { 
          shouldForward: containsKeyword, 
          reason: containsKeyword ? undefined : `Message doesn't match whitelist keywords` as string | undefined
        };
      } else {
        // 黑名单模式：不包含关键词的消息才转发
        return { 
          shouldForward: !containsKeyword, 
          reason: containsKeyword ? `Message matches blacklist keywords` as string : undefined
        };
      }
    } catch (error) {
      logger.error('Error checking message against filter rules:', error);
      // 发生错误时，默认允许转发，避免误过滤
      return { shouldForward: true, reason: 'Error in filter processing' as string };
    }
  }

  /**
   * 从消息中提取文本内容
   */
  private extractTextFromMessage(message: any): string {
    let text = '';
    
    if (message.text) {
      text = message.text;
    } else if (message.caption) {
      text = message.caption;
    }
    
    return text.toLowerCase().trim();
  }

  /**
   * 检查文本是否包含任何关键词
   */
  private checkKeywords(text: string, keywords: string[]): boolean {
    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase().trim();
      if (keywordLower && text.includes(keywordLower)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 创建默认的过滤规则
   */
  public createDefaultFilterRule(name: string, type: FilterType, keywords: string[] = []): FilterRule {
    return {
      id: 0, // 数据库会自动分配ID
      name,
      type,
      keywords,
      isEnabled: true
    };
  }

  /**
   * 验证过滤规则的有效性
   */
  public validateFilterRule(rule: Partial<FilterRule>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!rule.name || rule.name.trim() === '') {
      errors.push('Filter rule name is required');
    }
    
    if (!rule.type || !Object.values(FilterType).includes(rule.type)) {
      errors.push('Invalid filter rule type');
    }
    
    if (rule.keywords && !Array.isArray(rule.keywords)) {
      errors.push('Keywords must be an array');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export default new MessageFilter();