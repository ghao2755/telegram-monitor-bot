#!/usr/bin/env node
import Bot from './modules/bot';
import logger from './utils/logger';
/**
 * Telegram 消息转发机器人的主入口文件
 */
async function main() {
    let bot = null;
    try {
        // 显示启动信息
        logger.info('🚀 Telegram 消息转发机器人启动中...');
        // 创建Bot实例
        bot = new Bot();
        // 初始化机器人
        await bot.initialize();
        // 启动机器人
        await bot.start();
        logger.info('🎉 机器人启动成功！使用 /start 命令开始配置。');
    }
    catch (error) {
        logger.error('❌ 机器人启动失败:', error);
        // 如果Bot实例已创建但启动失败，尝试优雅停止
        if (bot) {
            try {
                await bot.stop();
            }
            catch (stopError) {
                logger.error('❌ 停止机器人时发生错误:', stopError);
            }
        }
        // 退出进程并返回错误代码
        process.exit(1);
    }
}
// 运行主函数
main();
//# sourceMappingURL=index.js.map