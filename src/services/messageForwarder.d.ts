import { Telegraf } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram';
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
export declare class MessageForwarder {
    private bot;
    constructor(bot: Telegraf);
    /**
     * 转发消息到所有相关的目标群组
     */
    forwardMessage(sourceChatId: string, message: Message): Promise<void>;
    /**
     * 处理单个目标群组的消息转发
     */
    private processForwarding;
    /**
     * 根据消息类型执行相应的转发操作
     */
    private forwardByType;
    /**
     * 应用文本替换规则
     */
    private applyReplacements;
    /**
     * 将替换规则应用到文本上
     */
    private applyReplacementsToText;
}
export default MessageForwarder;
//# sourceMappingURL=messageForwarder.d.ts.map