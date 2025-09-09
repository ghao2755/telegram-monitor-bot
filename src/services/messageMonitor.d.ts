import { Telegraf } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram';
/**
 * 消息监控服务，负责定期检查源群组的新消息
 */
export declare class MessageMonitor {
    private bot;
    private pollingInterval;
    private lastMessageIds;
    private isRunning;
    private cronTask;
    constructor(bot: Telegraf);
    /**
     * 启动消息监控服务
     */
    start(): void;
    /**
     * 停止消息监控服务
     */
    stop(): void;
    /**
     * 检查源群组的新消息
     */
    private checkNewMessages;
    /**
     * 从特定群组获取新消息
     */
    private fetchNewMessagesFromGroup;
    /**
     * 处理接收到的消息
     */
    processMessage(message: Message): Promise<void>;
    /**
     * 获取监控服务状态
     */
    getStatus(): {
        isRunning: boolean;
        pollingInterval: number;
        monitoredGroups: number;
    };
}
export default MessageMonitor;
//# sourceMappingURL=messageMonitor.d.ts.map