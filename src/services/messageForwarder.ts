import { Telegraf } from 'telegraf';
import logger from '../utils/logger';
import dbManager from '../utils/db';
import messageFilter from './messageFilter';
import messageFormatter from './messageFormatter';
import statsService from './statsService';

/**
 * 替换规则接口
 */
export interface ReplacementRule {
  search: string;
  replace: string;
  isRegex: boolean;
}

/**
 * 消息转发服务，负责处理消息转发和文本替换逻辑
 */
export class MessageForwarder {
  private bot: Telegraf;
  private messageFilter = messageFilter;
  private messageFormatter = messageFormatter;
  private statsService = statsService;

  constructor(bot: Telegraf) {
    this.bot = bot;
  }

  /**
   * 转发消息到所有相关的目标群组
   */
  public async forwardMessage(sourceChatId: string, message: any): Promise<void> {
    try {
      const prisma = dbManager.getClient();
      
      // 首先检查这个源群组是否配置了转发
      // 在实际实现中，可能需要一个中间表来连接源群组和目标群组
      // 这里为了简化，我们获取所有目标群组
      const targetGroups = await prisma.targetGroup.findMany({
        include: {
          forwardingRule: true,
        },
      });

      if (targetGroups.length === 0) {
        logger.debug(`No target groups configured for forwarding from ${sourceChatId}`);
        return;
      }

      for (const targetGroup of targetGroups) {
        try {
          await this.processForwarding(targetGroup.chatId, message, targetGroup);
        } catch (error) {
          logger.error(`Failed to forward message to target group ${targetGroup.chatId}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error while processing message forwarding:', error);
    }
  }

  /**
   * 处理单个目标群组的消息转发
   */
  private async processForwarding(
    targetChatId: string,
    message: any,
    targetGroup: any
  ): Promise<void> {
    try {
      let textToForward = message.text || '';
      let captionToForward = message.caption || '';

      // 1. 检查消息是否应该被转发（应用过滤规则）
      const filterResult = await this.messageFilter.shouldForwardMessage(message, targetGroup.filterRule || null);
      
      if (!filterResult.shouldForward) {
        logger.debug(`Message blocked by filter for target group ${targetChatId}: ${filterResult.reason}`);
        await this.statsService.recordBlockedMessage();
        return; // 不转发被过滤的消息
      }

      // 2. 如果目标群组有配置转发规则，应用文本替换
      if (targetGroup.forwardingRule && targetGroup.forwardingRule.replacements && targetGroup.forwardingRule.isEnabled) {
        const replacements = JSON.parse(JSON.stringify(targetGroup.forwardingRule.replacements));
        
        if (textToForward) {
          textToForward = this.applyReplacementsToText(textToForward, replacements);
        }
        
        if (captionToForward) {
          captionToForward = this.applyReplacementsToText(captionToForward, replacements);
        }
      }

      // 3. 应用消息格式化
      if (targetGroup.messageFormat && targetGroup.messageFormat.isEnabled) {
        if (textToForward) {
          textToForward = await this.messageFormatter.formatMessageText(textToForward, targetGroup.messageFormat);
        }
        
        if (captionToForward) {
          captionToForward = await this.messageFormatter.formatMessageText(captionToForward, targetGroup.messageFormat);
        }
      }

      // 4. 获取消息发送选项
      const messageOptions = this.messageFormatter.getMessageOptions(targetGroup.messageFormat || null);
      
      // 5. 根据消息类型执行不同的转发逻辑
      const forwardedMessage = await this.forwardByType(targetChatId, message, textToForward, captionToForward, messageOptions);

      // 如果配置了置顶消息，则执行置顶操作
      if (targetGroup.shouldPin && forwardedMessage && forwardedMessage.message_id) {
        try {
          await this.bot.telegram.pinChatMessage(targetChatId, forwardedMessage.message_id);
          logger.debug(`Message pinned in target group ${targetChatId}`);
        } catch (error) {
          logger.error(`Failed to pin message in target group ${targetChatId}:`, error);
          // 即使置顶失败，转发本身也算成功
        }
      }

      logger.info(`Message forwarded successfully from ${message.chat?.id} to ${targetChatId}`);
      
      // 记录成功转发的统计数据
      await this.statsService.recordForwardedMessage();
    } catch (error) {
      logger.error(`Error forwarding message to ${targetChatId}:`, error);
      
      // 记录转发失败的统计数据
      await this.statsService.recordFailedMessage();
      
      throw error;
    }
  }

  /**
   * 根据消息类型执行相应的转发操作
   */
  private async forwardByType(targetChatId: string, message: any, processedText: string, processedCaption: string, options: any = {}): Promise<any> {
    try {
      // 检查消息类型并执行相应的转发逻辑
      if (message.text) {
        // 文本消息
        return await this.bot.telegram.sendMessage(targetChatId, processedText, options);
      } else if (message.photo) {
        // 照片消息
        return await this.bot.telegram.sendPhoto(targetChatId, message.photo[message.photo.length - 1].file_id, {
          caption: processedCaption,
          ...options
        });
      } else if (message.video) {
        // 视频消息
        return await this.bot.telegram.sendVideo(targetChatId, message.video.file_id, {
          caption: processedCaption,
          ...options
        });
      } else if (message.document) {
        // 文档消息
        return await this.bot.telegram.sendDocument(targetChatId, message.document.file_id, {
          caption: processedCaption,
          ...options
        });
      } else if (message.sticker) {
        // 贴纸消息
        return await this.bot.telegram.sendSticker(targetChatId, message.sticker.file_id);
      } else if (message.caption) {
        // 其他带标题的媒体消息
        // 这里使用通用的copyMessage方法
        return await this.bot.telegram.copyMessage(targetChatId, message.chat.id, message.message_id, {
          caption: processedCaption,
          ...options
        });
      } else {
        // 其他类型的消息，尝试使用通用转发方法
        logger.warn(`Unsupported message type for forwarding`);
        return await this.bot.telegram.forwardMessage(targetChatId, message.chat.id, message.message_id);
      }
    } catch (error) {
      logger.error(`Failed to forward message:`, error);
      throw error;
    }
  }

  /**
   * 将替换规则应用到文本上
   */
  private applyReplacementsToText(text: string, replacements: any[]): string {
    let processedText = text;

    for (const rule of replacements) {
      try {
        if (rule.isRegex) {
          // 正则表达式替换
          const regex = new RegExp(rule.search, 'g');
          processedText = processedText.replace(regex, rule.replace);
        } else {
          // 简单字符串替换
          processedText = processedText.replaceAll(rule.search, rule.replace);
        }
      } catch (error) {
        logger.error(`Failed to apply replacement rule (search: ${rule.search}):`, error);
        // 继续处理其他规则
      }
    }

    return processedText;
  }
}

export default MessageForwarder;