// 配置文件
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// 读取外部的文字替换规则JSON文件
function loadReplacementRules() {
  try {
    const rulesPath = path.join(__dirname, 'replacement_rules.json');
    if (fs.existsSync(rulesPath)) {
      const rulesContent = fs.readFileSync(rulesPath, 'utf8');
      return JSON.parse(rulesContent);
    }
    console.warn('未找到 replacement_rules.json 文件，使用默认替换规则');
    return {
      "旧词": "新词",
      "foo": "bar",
      "测试": "示例",
      "hello": "你好"
    };
  } catch (error) {
    console.error('加载替换规则时出错:', error);
    return {};
  }
}

// 解析环境变量中的ID列表（逗号分隔）
function parseIdList(envVar) {
  if (!envVar) return [];
  return envVar.split(',').map(id => id.trim()).filter(id => id);
}

module.exports = {
  // Telegram Bot Token
  botToken: process.env.BOT_TOKEN || '',
  
  // 管理员ID列表（从环境变量读取，逗号分隔）
  adminIds: parseIdList(process.env.ADMIN_IDS) || 
            (process.env.ADMIN_ID ? [process.env.ADMIN_ID] : []),
  
  // 调试模式
  debugMode: process.env.DEBUG_MODE === 'true',
  
  // 源群组ID列表（从环境变量读取，逗号分隔）
  sourceChatIds: parseIdList(process.env.SOURCE_CHAT_IDS) || 
                (process.env.SOURCE_CHAT_ID ? [process.env.SOURCE_CHAT_ID] : []),
  
  // 目标群组ID列表（从环境变量读取，逗号分隔）
  targetChatIds: parseIdList(process.env.TARGET_CHAT_IDS) || 
                (process.env.TARGET_CHAT_ID ? [process.env.TARGET_CHAT_ID] : []),
  
  // 其他配置选项
  botName: 'Message Forwarder Bot',
  
  // 消息转发相关配置
  forwardOptions: {
    // 转发消息时是否包含原始消息的发送者信息
    includeSenderName: true,
    
    // 是否转发媒体文件
    forwardMedia: true
  },
  
  // 文本替换规则映射表（从外部文件加载）
  textReplaceRules: loadReplacementRules()
};