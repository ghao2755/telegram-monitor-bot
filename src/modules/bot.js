import { Telegraf, Markup } from 'telegraf';
import configManager from '../utils/config';
import logger from '../utils/logger';
import dbManager from '../utils/db';
import MessageMonitor from '../services/messageMonitor';
import MessageForwarder from '../services/messageForwarder';
import { Message } from 'telegraf/typings/core/types/typegram';
/**
 * Telegram Bot 主类，管理机器人的生命周期和功能
 */
export class Bot {
    bot;
    messageMonitor;
    messageForwarder;
    isRunning = false;
    constructor() {
        const token = configManager.getBotToken();
        if (!token) {
            throw new Error('BOT_TOKEN is not set in .env file');
        }
        this.bot = new Telegraf(token);
        this.messageMonitor = new MessageMonitor(this.bot);
        this.messageForwarder = new MessageForwarder(this.bot);
    }
    /**
     * 初始化机器人
     */
    async initialize() {
        try {
            // 连接数据库
            await dbManager.connect();
            // 设置命令和处理程序
            this.setupCommands();
            this.setupEventHandlers();
            this.setupButtonHandlers();
            logger.info('Bot initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize bot:', error);
            throw error;
        }
    }
    /**
     * 启动机器人
     */
    async start() {
        try {
            if (this.isRunning) {
                logger.warn('Bot is already running');
                return;
            }
            // 启动消息监控服务
            this.messageMonitor.start();
            // 启动Telegraf机器人
            await this.bot.launch();
            this.isRunning = true;
            logger.info('Bot started successfully');
            // 处理进程终止信号
            this.handleProcessSignals();
        }
        catch (error) {
            logger.error('Failed to start bot:', error);
            throw error;
        }
    }
    /**
     * 停止机器人
     */
    async stop() {
        try {
            if (!this.isRunning) {
                logger.warn('Bot is not running');
                return;
            }
            // 停止消息监控服务
            this.messageMonitor.stop();
            // 停止Telegraf机器人
            await this.bot.stop();
            // 断开数据库连接
            await dbManager.disconnect();
            this.isRunning = false;
            logger.info('Bot stopped gracefully');
        }
        catch (error) {
            logger.error('Failed to stop bot gracefully:', error);
            throw error;
        }
    }
    /**
     * 设置机器人命令
     */
    setupCommands() {
        // /start 命令 - 显示主菜单
        this.bot.command('start', async (ctx) => {
            await this.showMainMenu(ctx);
        });
        // /status 命令 - 显示机器人状态
        this.bot.command('status', async (ctx) => {
            await this.showStatus(ctx);
        });
        // /help 命令 - 显示帮助信息
        this.bot.command('help', async (ctx) => {
            await this.showHelp(ctx);
        });
    }
    /**
     * 设置事件处理器
     */
    setupEventHandlers() {
        // 处理接收到的消息
        this.bot.on('message', async (ctx) => {
            try {
                const message = ctx.message;
                if (message) {
                    // 让消息监控服务处理消息
                    await this.messageMonitor.processMessage(message);
                    // 这里可以添加更多的消息处理逻辑
                    // 例如，检查消息是否来自管理用户，或者是否包含特定命令
                }
            }
            catch (error) {
                logger.error('Error processing message event:', error);
            }
        });
        // 处理错误
        this.bot.catch((error, ctx) => {
            logger.error(`Error in bot context ${ctx.updateType}:`, error);
        });
    }
    /**
     * 设置按钮回调处理器
     */
    setupButtonHandlers() {
        // 主菜单按钮回调
        this.bot.action('menu_source_groups', async (ctx) => {
            await this.showSourceGroupsMenu(ctx);
        });
        this.bot.action('menu_target_groups', async (ctx) => {
            await this.showTargetGroupsMenu(ctx);
        });
        this.bot.action('menu_forwarding_rules', async (ctx) => {
            await this.showForwardingRulesMenu(ctx);
        });
        this.bot.action('menu_back', async (ctx) => {
            await this.showMainMenu(ctx);
        });
        // 可以在这里添加更多按钮回调处理器
    }
    /**
     * 显示主菜单
     */
    async showMainMenu(ctx) {
        try {
            await ctx.reply('请选择要执行的操作:', {
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('📝 管理源群组', 'menu_source_groups')],
                    [Markup.button.callback('📨 管理目标群组', 'menu_target_groups')],
                    [Markup.button.callback('⚙️ 管理转发规则', 'menu_forwarding_rules')],
                    [Markup.button.callback('📊 查看机器人状态', 'menu_status')],
                ])
            });
        }
        catch (error) {
            logger.error('Failed to show main menu:', error);
            await ctx.reply('显示菜单时出错，请稍后再试。');
        }
    }
    /**
     * 显示源群组管理菜单
     */
    async showSourceGroupsMenu(ctx) {
        try {
            // 在实际实现中，这里应该显示当前配置的源群组列表和管理选项
            await ctx.reply('源群组管理:', {
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('➕ 添加源群组', 'add_source_group')],
                    [Markup.button.callback('➖ 移除源群组', 'remove_source_group')],
                    [Markup.button.callback('📋 查看源群组列表', 'list_source_groups')],
                    [Markup.button.callback('⬅️ 返回', 'menu_back')],
                ])
            });
        }
        catch (error) {
            logger.error('Failed to show source groups menu:', error);
            await ctx.reply('显示源群组菜单时出错，请稍后再试。');
        }
    }
    /**
     * 显示目标群组管理菜单
     */
    async showTargetGroupsMenu(ctx) {
        try {
            // 在实际实现中，这里应该显示当前配置的目标群组列表和管理选项
            await ctx.reply('目标群组管理:', {
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('➕ 添加目标群组', 'add_target_group')],
                    [Markup.button.callback('➖ 移除目标群组', 'remove_target_group')],
                    [Markup.button.callback('📋 查看目标群组列表', 'list_target_groups')],
                    [Markup.button.callback('⬅️ 返回', 'menu_back')],
                ])
            });
        }
        catch (error) {
            logger.error('Failed to show target groups menu:', error);
            await ctx.reply('显示目标群组菜单时出错，请稍后再试。');
        }
    }
    /**
     * 显示转发规则管理菜单
     */
    async showForwardingRulesMenu(ctx) {
        try {
            // 在实际实现中，这里应该显示当前配置的转发规则列表和管理选项
            await ctx.reply('转发规则管理:', {
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('➕ 创建转发规则', 'create_forwarding_rule')],
                    [Markup.button.callback('✏️ 编辑转发规则', 'edit_forwarding_rule')],
                    [Markup.button.callback('➖ 删除转发规则', 'delete_forwarding_rule')],
                    [Markup.button.callback('📋 查看转发规则列表', 'list_forwarding_rules')],
                    [Markup.button.callback('⬅️ 返回', 'menu_back')],
                ])
            });
        }
        catch (error) {
            logger.error('Failed to show forwarding rules menu:', error);
            await ctx.reply('显示转发规则菜单时出错，请稍后再试。');
        }
    }
    /**
     * 显示机器人状态信息
     */
    async showStatus(ctx) {
        try {
            const monitorStatus = this.messageMonitor.getStatus();
            const prisma = dbManager.getClient();
            // 获取数据库中的群组和规则数量
            const sourceGroupsCount = await prisma.sourceGroup.count();
            const targetGroupsCount = await prisma.targetGroup.count();
            const forwardingRulesCount = await prisma.forwardingRule.count();
            const statusMessage = `🚀 机器人状态\n\n` +
                `🟢 运行状态: ${this.isRunning ? '在线' : '离线'}\n` +
                `🔄 消息监控: ${monitorStatus.isRunning ? '开启' : '关闭'}\n` +
                `⏱️ 轮询间隔: ${monitorStatus.pollingInterval}ms\n\n` +
                `📊 统计信息\n` +
                `📝 源群组数量: ${sourceGroupsCount}\n` +
                `📨 目标群组数量: ${targetGroupsCount}\n` +
                `⚙️ 转发规则数量: ${forwardingRulesCount}`;
            await ctx.reply(statusMessage);
        }
        catch (error) {
            logger.error('Failed to show bot status:', error);
            await ctx.reply('获取机器人状态时出错，请稍后再试。');
        }
    }
    /**
     * 显示帮助信息
     */
    async showHelp(ctx) {
        try {
            const helpMessage = `📚 Telegram 消息转发机器人使用帮助\n\n` +
                `💡 这个机器人可以监控指定群组的消息并自动转发到其他群组。\n\n` +
                `📝 可用命令:\n` +
                `/start - 启动机器人并显示主菜单\n` +
                `/status - 查看机器人当前状态\n` +
                `/help - 显示此帮助信息\n\n` +
                `⚙️ 主要功能:\n` +
                `• 消息监控和自动转发\n` +
                `• 支持文本替换（包括正则表达式）\n` +
                `• 每个目标群组独立设置置顶选项\n` +
                `• 每个目标群组可选择不同的转发规则\n` +
                `• 完整的群组和规则管理界面`;
            await ctx.reply(helpMessage);
        }
        catch (error) {
            logger.error('Failed to show help message:', error);
            await ctx.reply('显示帮助信息时出错，请稍后再试。');
        }
    }
    /**
     * 处理进程终止信号
     */
    handleProcessSignals() {
        process.once('SIGINT', async () => {
            logger.info('Received SIGINT signal, shutting down...');
            await this.stop();
            process.exit(0);
        });
        process.once('SIGTERM', async () => {
            logger.info('Received SIGTERM signal, shutting down...');
            await this.stop();
            process.exit(0);
        });
    }
    /**
     * 获取机器人运行状态
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            monitorStatus: this.messageMonitor.getStatus(),
        };
    }
}
export default Bot;
//# sourceMappingURL=bot.js.map