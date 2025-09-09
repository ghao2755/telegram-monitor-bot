/**
 * 消息格式化服务，用于修改消息格式
 */
import logger from '../utils/logger';

/**
 * 消息格式配置接口
 */
export interface MessageFormatConfig {
  id: number;
  name: string;
  prefix?: string;
  suffix?: string;
  enableMarkdown: boolean;
  isEnabled: boolean;
}

/**
 * 消息格式化服务
 */
export class MessageFormatter {
  /**
   * 根据格式配置处理消息文本
   */
  public async formatMessageText(text: string, formatConfig: MessageFormatConfig | null): Promise<string> {
    try {
      // 如果没有设置格式配置或配置未启用，返回原始文本
      if (!formatConfig || !formatConfig.isEnabled) {
        return text;
      }

      let formattedText = text;

      // 应用前缀
      if (formatConfig.prefix) {
        formattedText = formatConfig.prefix + '\n' + formattedText;
      }

      // 应用后缀
      if (formatConfig.suffix) {
        formattedText = formattedText + '\n' + formatConfig.suffix;
      }

      return formattedText;
    } catch (error) {
      logger.error('Error formatting message text:', error);
      // 发生错误时，返回原始文本
      return text;
    }
  }

  /**
   * 获取消息发送选项，包括格式设置
   */
  public getMessageOptions(formatConfig: MessageFormatConfig | null): any {
    const options: any = {};
    
    // 如果启用了Markdown格式
    if (formatConfig && formatConfig.isEnabled && formatConfig.enableMarkdown) {
      options.parse_mode = 'MarkdownV2';
    }
    
    return options;
  }

  /**
   * 清理Markdown特殊字符，避免格式错误
   */
  public escapeMarkdown(text: string): string {
    if (!text) {
      return text;
    }
    
    // 需要转义的MarkdownV2特殊字符
    const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
    
    let escapedText = text;
    
    for (const char of specialChars) {
      escapedText = escapedText.replace(new RegExp(`\\?${char}`, 'g'), (match) => {
        // 如果字符已经被转义，保持不变
        if (match.length === 2 && match[0] === '\\') {
          return match;
        }
        return `\\${char}`;
      });
    }
    
    return escapedText;
  }

  /**
   * 创建默认的消息格式配置
   */
  public createDefaultFormatConfig(name: string): MessageFormatConfig {
    return {
      id: 0, // 数据库会自动分配ID
      name,
      prefix: '',
      suffix: '',
      enableMarkdown: false,
      isEnabled: true
    };
  }

  /**
   * 验证消息格式配置的有效性
   */
  public validateFormatConfig(config: Partial<MessageFormatConfig>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!config.name || config.name.trim() === '') {
      errors.push('Format config name is required');
    }
    
    // 验证Markdown内容（如果启用了Markdown）
    if (config.enableMarkdown && (config.prefix || config.suffix)) {
      // 在实际应用中，可以添加更复杂的Markdown验证
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export default new MessageFormatter();