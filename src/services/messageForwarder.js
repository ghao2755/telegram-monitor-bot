import { Telegraf } from 'telegraf';
import logger from '../utils/logger';
import dbManager from '../utils/db';
import { Message } from 'telegraf/typings/core/types/typegram';
/**
 * 消息转发服务，负责处理消息转发和文本替换逻辑
 */
export class MessageForwarder {
    bot;
    constructor(bot) {
        this.bot = bot;
    }
    /**
     * 转发消息到所有相关的目标群组
     */
    async forwardMessage(sourceChatId, message) {
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
                }
                catch (error) {
                    logger.error(`Failed to forward message to target group ${targetGroup.chatId}:`, error);
                }
            }
        }
        catch (error) {
            logger.error('Error while processing message forwarding:', error);
        }
    }
    /**
     * 处理单个目标群组的消息转发
     */
    async processForwarding(targetChatId, message, targetGroup // 在实际实现中应使用正确的类型
    ) {
        try {
            let processedMessage = { ...message };
            // 如果目标群组有配置转发规则，应用文本替换
            if (targetGroup.forwardingRule && targetGroup.forwardingRule.replacements) {
                processedMessage = await this.applyReplacements(processedMessage, targetGroup.forwardingRule.replacements);
            }
            // 根据消息类型执行不同的转发逻辑
            const forwardedMessage = await this.forwardByType(targetChatId, processedMessage);
            // 如果配置了置顶消息，则执行置顶操作
            if (targetGroup.shouldPin && forwardedMessage && forwardedMessage.message_id) {
                try {
                    await this.bot.telegram.pinChatMessage(targetChatId, forwardedMessage.message_id);
                    logger.debug(`Message pinned in target group ${targetChatId}`);
                }
                catch (error) {
                    logger.error(`Failed to pin message in target group ${targetChatId}:`, error);
                    // 即使置顶失败，转发本身也算成功
                }
            }
            logger.info(`Message forwarded successfully from ${message.chat?.id} to ${targetChatId}`);
        }
        catch (error) {
            logger.error(`Error forwarding message to ${targetChatId}:`, error);
            throw error;
        }
    }
    /**
     * 根据消息类型执行相应的转发操作
     */
    async forwardByType(targetChatId, message) {
        try {
            // 检查消息类型并执行相应的转发逻辑
            if (message.text || message.caption) {
                // 文本消息或带有标题的媒体消息
                return await this.bot.telegram.copyMessage(targetChatId, message.chat.id, message.message_id, {
                    caption: message.caption, // 复制消息时caption会自动应用
                });
            }
            else if (message.photo) {
                // 照片消息
                return await this.bot.telegram.sendPhoto(targetChatId, message.photo[message.photo.length - 1].file_id, {
                    caption: message.caption,
                });
            }
            else if (message.video) {
                // 视频消息
                return await this.bot.telegram.sendVideo(targetChatId, message.video.file_id, {
                    caption: message.caption,
                });
            }
            else if (message.document) {
                // 文档消息
                return await this.bot.telegram.sendDocument(targetChatId, message.document.file_id, {
                    caption: message.caption,
                });
            }
            else if (message.sticker) {
                // 贴纸消息
                return await this.bot.telegram.sendSticker(targetChatId, message.sticker.file_id);
            }
            else {
                // 其他类型的消息，尝试使用通用转发方法
                logger.warn(`Unsupported message type for forwarding: ${message}`);
                return await this.bot.telegram.forwardMessage(targetChatId, message.chat.id, message.message_id);
            }
        }
        catch (error) {
            logger.error(`Failed to forward message of type ${message}:`, error);
            throw error;
        }
    }
    /**
     * 应用文本替换规则
     */
    async applyReplacements(message, replacements) {
        try {
            const processedMessage = { ...message };
            // 处理文本消息
            if (processedMessage.text) {
                processedMessage.text = this.applyReplacementsToText(processedMessage.text, replacements);
            }
            // 处理带有标题的媒体消息
            if (processedMessage.caption) {
                processedMessage.caption = this.applyReplacementsToText(processedMessage.caption, replacements);
            }
            return processedMessage;
        }
        catch (error) {
            logger.error('Error applying text replacements:', error);
            // 如果应用替换规则失败，返回原始消息
            return message;
        }
    }
    /**
     * 将替换规则应用到文本上
     */
    applyReplacementsToText(text, replacements) {
        let processedText = text;
        for (const rule of replacements) {
            try {
                if (rule.isRegex) {
                    // 正则表达式替换
                    const regex = new RegExp(rule.search, 'g');
                    processedText = processedText.replace(regex, rule.replace);
                }
                else {
                    // 简单字符串替换
                    processedText = processedText.replaceAll(rule.search, rule.replace);
                }
            }
            catch (error) {
                logger.error(`Failed to apply replacement rule (search: ${rule.search}):`, error);
                // 继续处理其他规则
            }
        }
        return processedText;
    }
}
export default MessageForwarder;
//# sourceMappingURL=messageForwarder.js.map