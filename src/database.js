// 导入必要的模块
const fs = require('fs-extra');
const path = require('path');

// 导入日志模块
const logger = require('./logger');

// 导入验证函数，添加错误处理
let validateGroupsData, validateRulesData;
try {
  const utils = require('./utils');
  validateGroupsData = utils.validateGroupsData;
  validateRulesData = utils.validateRulesData;
  
  if (!validateGroupsData || !validateRulesData) {
    throw new Error('utils模块中缺少必要的验证函数');
  }
} catch (error) {
  logger.error('导入验证函数失败:', error);
  // 提供默认的验证函数实现作为备选
  validateGroupsData = (data) => {
    if (!data) return { sources: [], targets: [] };
    return { sources: [], targets: [] };
  };
  validateRulesData = (data) => {
    if (!data) return { global: {}, groupSpecific: {} };
    return { global: {}, groupSpecific: {} };
  };
}

// 定义数据文件路径
const DATA_DIR = path.join(__dirname, '..', 'data');
const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');
const RULES_FILE = path.join(DATA_DIR, 'rules.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// 默认数据
const DEFAULT_GROUPS = {
  sources: [],
  targets: []
};

const DEFAULT_RULES = {
  global: {},
  groupSpecific: {}
};

const DEFAULT_SETTINGS = {
  autoStart: true,
  checkInterval: 300000, // 默认5分钟
  lastCheck: new Date().toISOString()
};

// 初始化数据库
const init = async () => {
  try {
    // 确保数据目录存在
    await fs.ensureDir(DATA_DIR);
    
    // 初始化群组数据文件
    if (!await fs.pathExists(GROUPS_FILE)) {
      await safeWriteFile(GROUPS_FILE, DEFAULT_GROUPS);
      logger.info('已创建默认群组数据文件');
    }
    
    // 初始化规则数据文件
    if (!await fs.pathExists(RULES_FILE)) {
      await safeWriteFile(RULES_FILE, DEFAULT_RULES);
      logger.info('已创建默认规则数据文件');
    }
    
    // 初始化系统设置文件
    if (!await fs.pathExists(SETTINGS_FILE)) {
      await safeWriteFile(SETTINGS_FILE, DEFAULT_SETTINGS);
      logger.info('已创建默认系统设置文件');
    }
    
    logger.info('数据库初始化成功');
  } catch (error) {
    logger.error('数据库初始化失败:', error);
    throw error;
  }
};

// 文件锁对象，用于防止并发写入
const fileLocks = new Map();

// 安全写入文件函数 - 增强版，包含目录确保、文件锁和错误处理
async function safeWriteFile(filePath, data, maxRetries = 3) {
  try {
    // 确保目录存在
    await fs.ensureDir(path.dirname(filePath));
    
    let retries = 0;
    const lockKey = filePath;
    
    while (true) {
      try {
        // 尝试获取文件锁
        while (fileLocks.has(lockKey)) {
          // 如果文件已被锁定，等待一段时间后重试
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // 设置锁
        fileLocks.set(lockKey, true);
        
        try {
          // 创建文件备份（如果文件已存在）
          if (await fs.pathExists(filePath)) {
            const backupPath = `${filePath}.bak`;
            await fs.copyFile(filePath, backupPath);
          }
          
          // 写入文件
          await fs.writeFile(filePath, JSON.stringify(data, null, 2));
          logger.debug(`安全写入文件成功: ${filePath}`);
          return true;
        } finally {
          // 确保释放锁
          fileLocks.delete(lockKey);
        }
      } catch (error) {
        retries++;
        
        if (retries >= maxRetries) {
          logger.error(`安全写入文件 ${filePath} 失败（已重试${maxRetries}次）:`, error);
          throw error;
        }
        
        logger.warn(`安全写入文件 ${filePath} 失败，${retries * 1000}毫秒后重试（第${retries}次）:`, error.message);
        await new Promise(resolve => setTimeout(resolve, 1000 * retries)); // 递增延迟重试
      }
    }
  } catch (error) {
    logger.error('文件写入失败:', error);
    return false;
  }
}

// 读取文件内容的通用函数 - 添加重试机制
const readFile = async (filePath, defaultValue, maxRetries = 3) => {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      // 检查文件是否存在
      if (!await fs.pathExists(filePath)) {
        await safeWriteFile(filePath, defaultValue);
        return defaultValue;
      }
      
      // 读取文件内容
      const content = await fs.readJSON(filePath);
      return content;
    } catch (error) {
      retries++;
      
      if (retries >= maxRetries) {
        logger.error(`读取文件 ${filePath} 失败，返回默认值（已重试${maxRetries}次）:`, error);
        return defaultValue; // 返回默认值而不是抛出错误
      }
      
      logger.warn(`读取文件 ${filePath} 失败，${retries}秒后重试（第${retries}次）:`, error.message);
      await new Promise(resolve => setTimeout(resolve, 1000 * retries)); // 递增延迟重试
    }
  }
  
  return defaultValue; // 理论上不会到达这里，但为了安全起见
};

// 写入文件的通用函数 - 使用增强版的safeWriteFile
const writeFile = async (filePath, data, maxRetries = 3) => {
  return await safeWriteFile(filePath, data, maxRetries);
};

// 群组配置管理

// 获取所有群组配置
const getGroups = async () => {
  try {
    const data = await readFile(GROUPS_FILE, DEFAULT_GROUPS);
    // 使用验证函数确保数据格式正确
    return validateGroupsData(data);
  } catch (error) {
    logger.error('获取群组配置失败:', error);
    return DEFAULT_GROUPS;
  }
};

// 添加源群组
const addSourceGroup = async (groupId, groupName) => {
  try {
    const groups = await getGroups();
    
    // 检查群组是否已存在
    const existingGroup = groups.sources.find(g => g.id === groupId);
    if (existingGroup) {
      throw new Error('该源群组已存在');
    }
    
    // 添加新群组
    groups.sources.push({
      id: groupId,
      name: groupName,
      enabled: true
    });
    
    await safeWriteFile(GROUPS_FILE, groups);
    console.log(`已添加源群组: ${groupName} (ID: ${groupId})`);
  } catch (error) {
    console.error('添加源群组失败:', error);
    throw error;
  }
};

// 添加目标群组
const addTargetGroup = async (groupId, groupName) => {
  try {
    const groups = await getGroups();
    
    // 检查群组是否已存在
    const existingGroup = groups.targets.find(g => g.id === groupId);
    if (existingGroup) {
      throw new Error('该目标群组已存在');
    }
    
    // 添加新群组
    groups.targets.push({
      id: groupId,
      name: groupName,
      enabled: true,
      pinEnabled: false
    });
    
    await safeWriteFile(GROUPS_FILE, groups);
    console.log(`已添加目标群组: ${groupName} (ID: ${groupId})`);
  } catch (error) {
    console.error('添加目标群组失败:', error);
    throw error;
  }
};

// 删除群组
const deleteGroup = async (groupId) => {
  try {
    const groups = await getGroups();
    
    // 检查并删除源群组
    const sourceIndex = groups.sources.findIndex(g => g.id === groupId);
    if (sourceIndex !== -1) {
      groups.sources.splice(sourceIndex, 1);
      await safeWriteFile(GROUPS_FILE, groups);
      console.log(`已删除源群组 (ID: ${groupId})`);
      return true;
    }
    
    // 检查并删除目标群组
    const targetIndex = groups.targets.findIndex(g => g.id === groupId);
    if (targetIndex !== -1) {
      groups.targets.splice(targetIndex, 1);
      await safeWriteFile(GROUPS_FILE, groups);
      console.log(`已删除目标群组 (ID: ${groupId})`);
      return true;
    }
    
    throw new Error('未找到该群组');
  } catch (error) {
    console.error('删除群组失败:', error);
    return false;
  }
};

// 切换群组状态（启用/禁用）
const toggleGroupStatus = async (groupId) => {
  try {
    const groups = await getGroups();
    
    // 检查源群组
    let group = groups.sources.find(g => g.id === groupId);
    if (!group) {
      // 检查目标群组
      group = groups.targets.find(g => g.id === groupId);
    }
    
    if (!group) {
      throw new Error('未找到该群组');
    }
    
    // 切换状态
    group.enabled = !group.enabled;
    
    await safeWriteFile(GROUPS_FILE, groups);
    console.log(`已切换群组状态: ${group.name} (ID: ${groupId}) - 现在${group.enabled ? '启用' : '禁用'}`);
    return true;
  } catch (error) {
    console.error('切换群组状态失败:', error);
    return false;
  }
};

// 切换目标群组的置顶状态
const togglePinStatus = async (groupId) => {
  try {
    const groups = await getGroups();
    const group = groups.targets.find(g => g.id === groupId);
    
    if (!group) {
      throw new Error('未找到该目标群组');
    }
    
    // 切换置顶状态
    group.pinEnabled = !group.pinEnabled;
    
    await safeWriteFile(GROUPS_FILE, groups);
    console.log(`已切换群组置顶状态: ${group.name} (ID: ${groupId}) - 现在${group.pinEnabled ? '启用' : '禁用'}`);
    return true;
  } catch (error) {
    console.error('切换置顶状态失败:', error);
    return false;
  }
};

// 规则配置管理

// 获取所有规则
const getRules = async () => {
  try {
    const data = await readFile(RULES_FILE, DEFAULT_RULES);
    // 使用验证函数确保数据格式正确
    return validateRulesData(data);
  } catch (error) {
    console.error('获取规则配置失败:', error);
    return DEFAULT_RULES;
  }
};

// 添加全局规则
const addGlobalRule = async (keyword, replacement) => {
  try {
    const rules = await getRules();
    
    // 添加或更新规则
    rules.global[keyword] = replacement;
    
    await safeWriteFile(RULES_FILE, rules);
    console.log(`已添加全局规则: ${keyword} → ${replacement}`);
  } catch (error) {
    console.error('添加全局规则失败:', error);
    throw error;
  }
};

// 删除全局规则
const deleteGlobalRule = async (keyword) => {
  try {
    const rules = await getRules();
    
    if (!(keyword in rules.global)) {
      throw new Error('未找到该全局规则');
    }
    
    // 删除规则
    delete rules.global[keyword];
    
    await safeWriteFile(RULES_FILE, rules);
    console.log(`已删除全局规则: ${keyword}`);
    return true;
  } catch (error) {
    console.error('删除全局规则失败:', error);
    return false;
  }
};

// 获取群组专属规则
const getGroupRules = async (groupId) => {
  try {
    const rules = await getRules();
    return rules.groupSpecific[groupId] || null;
  } catch (error) {
    console.error(`获取群组 ${groupId} 规则失败:`, error);
    return null;
  }
};

// 添加群组专属规则
const addGroupRule = async (groupId, keyword, replacement) => {
  try {
    const rules = await getRules();
    
    // 确保群组规则对象存在
    if (!rules.groupSpecific[groupId]) {
      rules.groupSpecific[groupId] = {
        enabled: true,
        inheritGlobal: true,
        rules: {}
      };
    }
    
    // 添加规则
    rules.groupSpecific[groupId].rules[keyword] = replacement;
    
    await safeWriteFile(RULES_FILE, rules);
    console.log(`已添加群组 ${groupId} 专属规则: ${keyword} → ${replacement}`);
  } catch (error) {
    console.error(`添加群组 ${groupId} 专属规则失败:`, error);
    throw error;
  }
};

// 删除群组专属规则
const deleteGroupRule = async (groupId, keyword) => {
  try {
    const rules = await getRules();
    
    if (!rules.groupSpecific[groupId] || !(keyword in rules.groupSpecific[groupId].rules)) {
      throw new Error('未找到该群组规则');
    }
    
    // 删除规则
    delete rules.groupSpecific[groupId].rules[keyword];
    
    // 如果没有规则了，删除整个群组规则对象
    if (Object.keys(rules.groupSpecific[groupId].rules).length === 0) {
      delete rules.groupSpecific[groupId];
    }
    
    await safeWriteFile(RULES_FILE, rules);
    console.log(`已删除群组 ${groupId} 专属规则: ${keyword}`);
    return true;
  } catch (error) {
    console.error(`删除群组 ${groupId} 专属规则失败:`, error);
    return false;
  }
};

// 切换群组规则状态
const toggleGroupRulesStatus = async (groupId) => {
  try {
    const rules = await getRules();
    
    if (!rules.groupSpecific[groupId]) {
      throw new Error('未找到该群组的规则配置');
    }
    
    // 切换状态
    rules.groupSpecific[groupId].enabled = !rules.groupSpecific[groupId].enabled;
    
    await safeWriteFile(RULES_FILE, rules);
    console.log(`已切换群组 ${groupId} 规则状态 - 现在${rules.groupSpecific[groupId].enabled ? '启用' : '禁用'}`);
    return true;
  } catch (error) {
    console.error(`切换群组 ${groupId} 规则状态失败:`, error);
    return false;
  }
};

// 切换群组是否继承全局规则
const toggleInheritGlobalRules = async (groupId) => {
  try {
    const rules = await getRules();
    
    if (!rules.groupSpecific[groupId]) {
      throw new Error('未找到该群组的规则配置');
    }
    
    // 切换继承状态
    rules.groupSpecific[groupId].inheritGlobal = !rules.groupSpecific[groupId].inheritGlobal;
    
    await safeWriteFile(RULES_FILE, rules);
    console.log(`已切换群组 ${groupId} 继承全局规则状态 - 现在${rules.groupSpecific[groupId].inheritGlobal ? '启用' : '禁用'}`);
    return true;
  } catch (error) {
    console.error(`切换群组 ${groupId} 继承全局规则状态失败:`, error);
    return false;
  }
};

// 系统设置管理

// 获取系统设置
const getSettings = async () => {
  try {
    return await readFile(SETTINGS_FILE, DEFAULT_SETTINGS);
  } catch (error) {
    console.error('获取系统设置失败:', error);
    return DEFAULT_SETTINGS;
  }
};

// 更新检查间隔
const updateCheckInterval = async (interval) => {
  try {
    const settings = await getSettings();
    settings.checkInterval = interval;
    await safeWriteFile(SETTINGS_FILE, settings);
    console.log(`已更新检查间隔为: ${interval} 毫秒`);
  } catch (error) {
    console.error('更新检查间隔失败:', error);
    throw error;
  }
};

// 更新最后检查时间
const updateLastCheckTime = async () => {
  try {
    const settings = await getSettings();
    settings.lastCheck = new Date().toISOString();
    await safeWriteFile(SETTINGS_FILE, settings);
  } catch (error) {
    console.error('更新最后检查时间失败:', error);
    // 这个错误不需要抛出，因为不影响系统运行
  }
};

// 切换自动启动设置
const toggleAutoStart = async () => {
  try {
    const settings = await getSettings();
    settings.autoStart = !settings.autoStart;
    await safeWriteFile(SETTINGS_FILE, settings);
    console.log(`已切换自动启动设置 - 现在${settings.autoStart ? '启用' : '禁用'}`);
    return settings.autoStart;
  } catch (error) {
    console.error('切换自动启动设置失败:', error);
    throw error;
  }
};

// 规则测试函数
const testRules = async (chatId, testText) => {
  try {
    const rules = await getRules();
    let effectiveRules = { ...rules.global };
    const appliedRules = [];
    
    // 获取对该群组生效的所有规则
    if (rules.groupSpecific[chatId]) {
      const groupRules = rules.groupSpecific[chatId];
      
      if (groupRules.enabled) {
        if (groupRules.inheritGlobal !== false) {
          // 默认继承全局规则
          effectiveRules = { ...effectiveRules, ...groupRules.rules };
        } else {
          // 不继承全局规则
          effectiveRules = { ...groupRules.rules };
        }
      }
    }
    
    // 应用规则替换
    let processedText = testText;
    
    Object.entries(effectiveRules).forEach(([keyword, replacement]) => {
      try {
        // 尝试将关键词解析为正则表达式
        const regex = new RegExp(keyword, 'g');
        
        if (regex.test(processedText)) {
          processedText = processedText.replace(regex, replacement);
          appliedRules.push({ keyword, replacement });
        }
      } catch (error) {
        // 如果解析失败，使用普通字符串替换
        if (processedText.includes(keyword)) {
          processedText = processedText.split(keyword).join(replacement);
          appliedRules.push({ keyword, replacement });
        }
      }
    });
    
    // 返回替换结果和应用的规则列表
    return {
      originalText: testText,
      processedText: processedText,
      appliedRules: appliedRules,
      totalRules: Object.keys(effectiveRules).length
    };
  } catch (error) {
    console.error('测试规则失败:', error);
    throw error;
  }
};

// 导入/导出功能

// 导出规则为JSON文件
const exportRules = async () => {
  try {
    const rules = await getRules();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportDir = path.join(__dirname, '..', 'exports');
    const exportFile = path.join(exportDir, `rules_export_${timestamp}.json`);
    
    // 确保导出目录存在
    await fs.ensureDir(exportDir);
    
    // 写入导出文件
    await safeWriteFile(exportFile, rules);
    
    console.log(`规则已导出到: ${exportFile}`);
    return exportFile;
  } catch (error) {
    console.error('导出规则失败:', error);
    throw error;
  }
};

// 从JSON文件导入规则
const importRules = async (filePath) => {
  try {
    // 读取导入文件
    const importedRules = await fs.readJSON(filePath);
    
    // 验证导入数据格式
    if (!importedRules.global || !importedRules.groupSpecific) {
      throw new Error('无效的规则文件格式');
    }
    
    // 写入规则文件
    await safeWriteFile(RULES_FILE, importedRules);
    
    console.log(`规则已从 ${filePath} 导入`);
    return true;
  } catch (error) {
    console.error('导入规则失败:', error);
    throw error;
  }
};

// 备份所有数据
const backupData = async () => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '..', 'backups');
    const backupFile = path.join(backupDir, `full_backup_${timestamp}.json`);
    
    // 确保备份目录存在
    await fs.ensureDir(backupDir);
    
    // 获取所有数据
    const allData = {
      groups: await getGroups(),
      rules: await getRules(),
      settings: await getSettings(),
      backupTime: new Date().toISOString()
    };
    
    // 写入备份文件
    await safeWriteFile(backupFile, allData);
    
    console.log(`数据已备份到: ${backupFile}`);
    return backupFile;
  } catch (error) {
    console.error('备份数据失败:', error);
    throw error;
  }
};

// 从备份恢复数据
const restoreData = async (backupFilePath) => {
  try {
    // 读取备份文件
    const backupData = await fs.readJSON(backupFilePath);
    
    // 验证备份数据
    if (!backupData.groups || !backupData.rules || !backupData.settings) {
      throw new Error('无效的备份文件格式');
    }
    
    // 恢复数据
    await safeWriteFile(GROUPS_FILE, backupData.groups);
    await safeWriteFile(RULES_FILE, backupData.rules);
    await safeWriteFile(SETTINGS_FILE, backupData.settings);
    
    console.log(`数据已从 ${backupFilePath} 恢复`);
    return true;
  } catch (error) {
    console.error('恢复数据失败:', error);
    throw error;
  }
};

// 导出模块
module.exports = {
  init,
  
  // 群组管理
  getGroups,
  addSourceGroup,
  addTargetGroup,
  deleteGroup,
  toggleGroupStatus,
  togglePinStatus,
  
  // 规则管理
  getRules,
  addGlobalRule,
  deleteGlobalRule,
  getGroupRules,
  addGroupRule,
  deleteGroupRule,
  toggleGroupRulesStatus,
  toggleInheritGlobalRules,
  
  // 系统设置管理
  getSettings,
  updateCheckInterval,
  updateLastCheckTime,
  toggleAutoStart,
  
  // 规则测试
  testRules,
  
  // 导入/导出和备份恢复
  exportRules,
  importRules,
  backupData,
  restoreData,
  
  // 导出增强版文件操作函数供外部使用
  safeWriteFile,
  readFile
};