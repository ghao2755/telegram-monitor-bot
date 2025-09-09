// 导入必要的模块
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const process = require('process');

// 导入日志模块
const logger = require('./logger');

// 定义会话文件路径
const SESSIONS_FILE = path.join(__dirname, '..', 'data', 'sessions.json');

// 机器人启动时间
const BOT_START_TIME = Date.now();

// 会话缓存
let sessionsCache = {};

// 会话过期时间（30分钟）
const SESSION_EXPIRATION_TIME = 30 * 60 * 1000;

// 初始化会话系统
const initSessions = async () => {
  try {
    if (await fs.pathExists(SESSIONS_FILE)) {
      sessionsCache = await fs.readJSON(SESSIONS_FILE);
      // 清理过期会话
      cleanupExpiredSessions();
    } else {
      sessionsCache = {};
      await fs.writeJSON(SESSIONS_FILE, sessionsCache, { spaces: 2 });
    }
  } catch (error) {
    logger.error('初始化会话系统失败:', error);
    sessionsCache = {};
  }
};

// 清理过期会话
const cleanupExpiredSessions = () => {
  const now = Date.now();
  const expiredCount = Object.keys(sessionsCache).reduce((count, userId) => {
    const session = sessionsCache[userId];
    // 检查会话是否存在且有最后访问时间
    if (session && session.lastAccessed && (now - session.lastAccessed > SESSION_EXPIRATION_TIME)) {
      delete sessionsCache[userId];
      return count + 1;
    }
    return count;
  }, 0);
  
  if (expiredCount > 0) {
    logger.info(`清理了 ${expiredCount} 个过期会话`);
    // 保存清理后的会话
    saveSessions();
  }
};

// 定时清理过期会话（每小时执行一次）
setInterval(() => {
  cleanupExpiredSessions();
}, 60 * 60 * 1000);

// 保存会话到文件
const saveSessions = async () => {
  try {
    await fs.writeJSON(SESSIONS_FILE, sessionsCache, { spaces: 2 });
  } catch (error) {
    logger.error('保存会话失败:', error);
  }
};

// 获取用户会话
const getUserSession = async (userId) => {
  try {
    // 延迟初始化
    if (Object.keys(sessionsCache).length === 0) {
      await initSessions();
    }
    
    // 确保会话对象存在
    if (!sessionsCache[userId]) {
      sessionsCache[userId] = {};
    }
    
    // 更新最后访问时间
    sessionsCache[userId].lastAccessed = Date.now();
    
    return { ...sessionsCache[userId] };
  } catch (error) {
    logger.error(`获取用户 ${userId} 会话失败:`, error);
    return {};
  }
};

// 设置用户会话
const setUserSession = async (userId, sessionData) => {
  try {
    // 延迟初始化
    if (Object.keys(sessionsCache).length === 0) {
      await initSessions();
    }
    
    // 确保会话对象存在
    if (!sessionsCache[userId]) {
      sessionsCache[userId] = {};
    }
    
    // 合并会话数据
    sessionsCache[userId] = {
      ...sessionsCache[userId],
      ...sessionData,
      lastAccessed: Date.now() // 更新最后访问时间
    };
    
    // 异步保存到文件（不阻塞主流程）
    saveSessions();
  } catch (error) {
    console.error(`设置用户 ${userId} 会话失败:`, error);
  }
};

// 清除用户会话
const clearUserSession = async (userId) => {
  try {
    if (sessionsCache[userId]) {
      delete sessionsCache[userId];
      saveSessions();
    }
  } catch (error) {
    console.error(`清除用户 ${userId} 会话失败:`, error);
  }
};

// 检查用户是否为管理员
const isAdmin = async (userId) => {
  try {
    if (!process.env.ADMIN_IDS) {
      console.warn('警告: 未设置ADMIN_IDS环境变量，所有用户均视为管理员');
      return true;
    }
    
    const adminIds = process.env.ADMIN_IDS.split(',').map(id => id.trim());
    return adminIds.includes(userId.toString());
  } catch (error) {
    console.error('检查管理员权限失败:', error);
    return false;
  }
};

// 获取机器人运行时间
const getUptime = () => {
  const uptimeMs = Date.now() - BOT_START_TIME;
  const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) {
    return `${days}天 ${hours}小时 ${minutes}分钟`;
  } else if (hours > 0) {
    return `${hours}小时 ${minutes}分钟`;
  } else {
    return `${minutes}分钟`;
  }
};

// 格式化时间戳
const formatTimestamp = (timestamp) => {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (error) {
    console.error('格式化时间戳失败:', error);
    return '无效时间';
  }
};

// 生成唯一ID
const generateUniqueId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// 验证群组ID格式
const validateGroupId = (groupId) => {
  const id = parseInt(groupId);
  return !isNaN(id) && id < 0; // Telegram群组ID为负数
};

// 验证正则表达式
const validateRegex = (pattern) => {
  try {
    new RegExp(pattern);
    return true;
  } catch (error) {
    return false;
  }
};

// 获取系统资源使用情况
const getSystemResources = () => {
  try {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const loadavg = os.loadavg();
    
    return {
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
        external: Math.round(memUsage.external / 1024 / 1024) + ' MB'
      },
      cpu: {
        user: cpuUsage.user / 1000 + ' ms',
        system: cpuUsage.system / 1000 + ' ms'
      },
      loadavg: loadavg.map(val => val.toFixed(2)).join(', '),
      uptime: os.uptime() + ' 秒'
    };
  } catch (error) {
    logger.error('获取系统资源使用情况失败:', error);
    return null;
  }
};

// 消息速率限制器
class RateLimiter {
  constructor(limitPerMinute) {
    this.limitPerMinute = limitPerMinute || 60; // 默认每分钟60条消息
    this.requests = new Map();
    this.interval = 60000; // 1分钟
  }

  // 检查是否被限制
  isLimited(key) {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    
    // 过滤掉过期的请求
    const recentRequests = requests.filter(timestamp => now - timestamp < this.interval);
    
    if (recentRequests.length >= this.limitPerMinute) {
      return true;
    }
    
    // 更新请求记录
    recentRequests.push(now);
    this.requests.set(key, recentRequests);
    
    return false;
  }

  // 清除限制记录
  clearLimit(key) {
    this.requests.delete(key);
  }

  // 获取剩余请求次数
  getRemainingRequests(key) {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    const recentRequests = requests.filter(timestamp => now - timestamp < this.interval);
    
    return Math.max(0, this.limitPerMinute - recentRequests.length);
  }
}

// 创建全局速率限制器实例
const rateLimiter = new RateLimiter();

// 错误处理函数
const handleError = (error, context = '') => {
  logger.error(`[${context || '未知上下文'}] 错误:`, error);
  
  // 可以在这里添加错误日志记录、通知管理员等功能
  
  return {
    success: false,
    error: error.message || '未知错误',
    code: error.code || 'UNKNOWN_ERROR'
  };
};

// 成功响应函数
const successResponse = (data = null, message = '操作成功') => {
  return {
    success: true,
    message: message,
    data: data
  };
};

// 延迟执行函数
const delay = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// 批量处理函数
const batchProcess = async (items, processFn, batchSize = 10) => {
  const results = [];
  const errors = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchPromises = batch.map(item => 
      processFn(item).then(result => ({ success: true, result }))
        .catch(error => ({ success: false, error }))
    );
    
    const batchResults = await Promise.all(batchPromises);
    
    batchResults.forEach((result, index) => {
      if (result.success) {
        results.push(result.result);
      } else {
        errors.push({
          item: batch[index],
          error: result.error
        });
      }
    });
    
    // 批次之间可以添加延迟，避免请求过于频繁
    if (i + batchSize < items.length) {
      await delay(1000);
    }
  }
  
  return {
    results,
    errors,
    totalProcessed: items.length,
    successCount: results.length,
    errorCount: errors.length
  };
};

// 文本处理函数
const processText = (text, options = {}) => {
  let processedText = text;
  
  // 转义HTML特殊字符
  if (options.escapeHtml) {
    processedText = processedText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  
  // 移除多余的空白字符
  if (options.trimWhitespace) {
    processedText = processedText.replace(/\s+/g, ' ').trim();
  }
  
  // 限制文本长度
  if (options.maxLength && processedText.length > options.maxLength) {
    processedText = processedText.substring(0, options.maxLength - 3) + '...';
  }
  
  return processedText;
};

// 多语言支持函数
const translate = (key, language = 'zh') => {
  const translations = {
    'zh': {
      'welcome': '欢迎使用Telegram监控机器人',
      'admin_only': '抱歉，只有管理员可以使用此机器人',
      'group_added': '成功添加群组',
      'rule_added': '成功添加规则',
      'operation_success': '操作成功',
      'operation_failed': '操作失败',
      'invalid_input': '无效的输入',
      'group_not_found': '未找到该群组',
      'rule_not_found': '未找到该规则',
      'please_wait': '请稍候...',
      'loading': '加载中...'
    },
    'en': {
      'welcome': 'Welcome to Telegram Monitor Bot',
      'admin_only': 'Sorry, only administrators can use this bot',
      'group_added': 'Group added successfully',
      'rule_added': 'Rule added successfully',
      'operation_success': 'Operation successful',
      'operation_failed': 'Operation failed',
      'invalid_input': 'Invalid input',
      'group_not_found': 'Group not found',
      'rule_not_found': 'Rule not found',
      'please_wait': 'Please wait...',
      'loading': 'Loading...'
    }
  };
  
  return translations[language]?.[key] || translations['zh']?.[key] || key;
};

// 数据验证工具函数
const validateGroupsData = (data) => {
  if (!data) return { sources: [], targets: [] };
  
  return {
    sources: Array.isArray(data.sources) ? data.sources : [],
    targets: Array.isArray(data.targets) ? data.targets : []
  };
};

const validateRulesData = (data) => {
  if (!data) return { global: {}, groupSpecific: {} };
  
  return {
    global: data.global && typeof data.global === 'object' ? data.global : {},
    groupSpecific: data.groupSpecific && typeof data.groupSpecific === 'object' ? data.groupSpecific : {}
  };
};

// 导出所有函数和类
module.exports = {
  // 会话管理
  getUserSession,
  setUserSession,
  clearUserSession,
  
  // 用户验证
  isAdmin,
  
  // 时间相关
  getUptime,
  formatTimestamp,
  
  // 工具函数
  generateUniqueId,
  validateGroupId,
  validateRegex,
  getSystemResources,
  validateGroupsData,
  validateRulesData,
  
  // 速率限制
  rateLimiter,
  
  // 响应处理
  handleError,
  successResponse,
  
  // 异步处理
  delay,
  batchProcess,
  
  // 文本处理
  processText,
  
  // 多语言支持
  translate
};