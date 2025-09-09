import MessageMonitor from '../services/messageMonitor';
/**
 * Telegram Bot 主类，管理机器人的生命周期和功能
 */
export declare class Bot {
    private bot;
    private messageMonitor;
    private messageForwarder;
    private isRunning;
    constructor();
    /**
     * 初始化机器人
     */
    initialize(): Promise<void>;
    /**
     * 启动机器人
     */
    start(): Promise<void>;
    /**
     * 停止机器人
     */
    stop(): Promise<void>;
    /**
     * 设置机器人命令
     */
    private setupCommands;
    /**
     * 设置事件处理器
     */
    private setupEventHandlers;
    /**
     * 设置按钮回调处理器
     */
    private setupButtonHandlers;
    /**
     * 显示主菜单
     */
    private showMainMenu;
    /**
     * 显示源群组管理菜单
     */
    private showSourceGroupsMenu;
    /**
     * 显示目标群组管理菜单
     */
    private showTargetGroupsMenu;
    /**
     * 显示转发规则管理菜单
     */
    private showForwardingRulesMenu;
    /**
     * 显示机器人状态信息
     */
    private showStatus;
    /**
     * 显示帮助信息
     */
    private showHelp;
    /**
     * 处理进程终止信号
     */
    private handleProcessSignals;
    /**
     * 获取机器人运行状态
     */
    getStatus(): {
        isRunning: boolean;
        monitorStatus: ReturnType<MessageMonitor['getStatus']>;
    };
}
export default Bot;
//# sourceMappingURL=bot.d.ts.map