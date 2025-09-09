// 主入口文件
const { Telegraf, Scenes, session } = require('telegraf');
const cron = require('node-cron');
const config = require('./config');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// 全局的置顶配置对象
let pinSettings = {};

// 全局的规则配置缓存，用于性能优化
let rulesConfigCache = null;
let rulesConfigLastUpdated = 0;
const RULES_CACHE_TTL = 1000 * 60; // 缓存有效期60秒

// 处理添加新群组规则
const handleAddNewGroupRule = (ctx) => {
  try {
    // 记录用户的期望操作
    if (ctx.session) {
      ctx.session.expecting = 'group_id_for_rule';
      ctx.session.menuLevel = 'add_group_rule';
    }
    
    ctx.editMessageText('请输入需要添加规则的群组ID（格式为 -1001234567890）：\n\n💡 提示：如果您不知道群组ID，可以转发一条来自该群组的消息获取。', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔙 取消', callback_data: 'group_rules_settings' }
          ]
        ]
      }
    });
  } catch (error) {
    console.error('处理添加新群组规则时出错:', error);
    ctx.editMessageText('❌ 处理请求时出错，请稍后重试。', getRuleManagementKeyboard());
  }
};

// 处理切换群组规则状态
const toggleGroupRules = async (ctx, groupId) => {
  try {
    // 使用按钮加载状态
    const buttonKey = startButtonLoading(ctx, `toggle_group_rules:${groupId}`);
    
    // 读取群组规则配置
    const groupRulesConfig = readGroupRulesConfig();
    
    // 确保群组配置存在
    if (!groupRulesConfig.group_specific_rules[groupId]) {
      groupRulesConfig.group_specific_rules[groupId] = {
        enabled: true,
        inherit_global: true,
        rules: {}
      };
    }
    
    // 切换状态
    const currentStatus = groupRulesConfig.group_specific_rules[groupId].enabled !== false;
    groupRulesConfig.group_specific_rules[groupId].enabled = !currentStatus;
    
    // 保存配置
    const saveResult = saveGroupRulesConfig(groupRulesConfig);
    
    if (saveResult) {
      // 状态切换成功
      const newStatus = groupRulesConfig.group_specific_rules[groupId].enabled;
      const statusText = newStatus ? '✅ 已启用' : '❌ 已禁用';
      
      // 显示操作成功提示
      ctx.answerCbQuery(`群组 ${groupId} 的规则状态已${newStatus ? '启用' : '禁用'}`, { show_alert: true });
      
      // 重新显示群组详情界面以更新状态
      await showGroupRuleDetails(ctx, groupId);
      
      // 记录日志
      if (config.debugMode) {
        console.log(`[切换群组规则状态] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 将群组 ${groupId} 的规则状态设置为 ${newStatus ? '启用' : '禁用'}`);
      }
    } else {
      // 状态切换失败
      ctx.answerCbQuery('❌ 保存配置时出错，请稍后重试', { show_alert: true });
    }
    
    // 结束按钮加载状态
    endButtonLoading(buttonKey);
  } catch (error) {
    console.error('切换群组规则状态时出错:', error);
    ctx.answerCbQuery('❌ 操作失败：' + error.message, { show_alert: true });
  }
};

// 处理切换继承全局规则
const toggleInheritGlobal = async (ctx, groupId) => {
  try {
    // 使用按钮加载状态
    const buttonKey = startButtonLoading(ctx, `toggle_inherit_global:${groupId}`);
    
    // 读取群组规则配置
    const groupRulesConfig = readGroupRulesConfig();
    
    // 确保群组配置存在
    if (!groupRulesConfig.group_specific_rules[groupId]) {
      groupRulesConfig.group_specific_rules[groupId] = {
        enabled: true,
        inherit_global: true,
        rules: {}
      };
    }
    
    // 切换继承状态
    const currentInherit = groupRulesConfig.group_specific_rules[groupId].inherit_global !== false;
    groupRulesConfig.group_specific_rules[groupId].inherit_global = !currentInherit;
    
    // 保存配置
    const saveResult = saveGroupRulesConfig(groupRulesConfig);
    
    if (saveResult) {
      // 状态切换成功
      const newInherit = groupRulesConfig.group_specific_rules[groupId].inherit_global;
      const inheritText = newInherit ? '✅ 是' : '❌ 否';
      
      // 显示操作成功提示
      ctx.answerCbQuery(`群组 ${groupId} 的全局规则继承已${newInherit ? '开启' : '关闭'}`, { show_alert: true });
      
      // 重新显示群组详情界面以更新状态
      await showGroupRuleDetails(ctx, groupId);
      
      // 记录日志
      if (config.debugMode) {
        console.log(`[切换继承全局规则] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 将群组 ${groupId} 的全局规则继承设置为 ${newInherit ? '开启' : '关闭'}`);
      }
    } else {
      // 状态切换失败
      ctx.answerCbQuery('❌ 保存配置时出错，请稍后重试', { show_alert: true });
    }
    
    // 结束按钮加载状态
    endButtonLoading(buttonKey);
  } catch (error) {
    console.error('切换继承全局规则时出错:', error);
    ctx.answerCbQuery('❌ 操作失败：' + error.message, { show_alert: true });
  }
};

// 处理查看生效规则
const handleViewEffectiveRules = async (ctx, groupId) => {
  try {
    // 使用按钮加载状态
    const buttonKey = startButtonLoading(ctx, `view_effective_rules:${groupId}`);
    
    // 获取该群组的有效规则
    const effectiveRules = getEffectiveRulesForGroup(groupId);
    const ruleKeys = Object.keys(effectiveRules);
    
    // 构建生效规则消息
    let message = `🏠 主页 > ⚙️ 配置管理 > 📝 替换规则 > 👥 群组规则设置 > 📋 群组生效规则\n\n`;
    message += `群组ID: ${groupId}\n`;
    message += `生效规则数量: ${ruleKeys.length}\n\n`;
    
    if (ruleKeys.length === 0) {
      message += `📝 当前该群组没有生效的替换规则。\n\n请检查群组规则设置和全局规则配置。`;
    } else {
      // 显示所有生效规则
      ruleKeys.forEach((oldWord, index) => {
        const newWord = effectiveRules[oldWord];
        message += `${index + 1}. '${oldWord}' → '${newWord}'\n`;
      });
    }
    
    // 创建返回键盘
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔙 返回群组规则详情', callback_data: `manage_group_rules:${groupId}` }
          ]
        ]
      }
    };
    
    // 更新消息
    ctx.editMessageText(message, keyboard);
    
    // 结束按钮加载状态
    endButtonLoading(buttonKey);
    
    // 更新消息并跟踪界面
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      const screenKey = `${ctx.from.id}_effective_rules_${groupId}`;
      activeScreens.set(screenKey, {
        chatId: ctx.chat.id,
        messageId: ctx.callbackQuery.message.message_id,
        type: 'effective_rules'
      });
    }
  } catch (error) {
    console.error('查看生效规则时出错:', error);
    ctx.editMessageText('❌ 处理请求时出错，请稍后重试。', getRuleManagementKeyboard());
  }
};

// 处理管理专属规则
const handleManageGroupSpecificRules = async (ctx, groupId) => {
  try {
    // 使用按钮加载状态
    const buttonKey = startButtonLoading(ctx, `manage_group_specific_rules:${groupId}`);
    
    // 读取群组规则配置
    const groupRulesConfig = readGroupRulesConfig();
    
    // 确保群组配置存在
    if (!groupRulesConfig.group_specific_rules[groupId]) {
      groupRulesConfig.group_specific_rules[groupId] = {
        enabled: true,
        inherit_global: true,
        rules: {}
      };
    }
    
    const groupRules = groupRulesConfig.group_specific_rules[groupId].rules || {};
    const ruleKeys = Object.keys(groupRules);
    
    // 构建专属规则消息
    let message = `🏠 主页 > ⚙️ 配置管理 > 📝 替换规则 > 👥 群组规则设置 > 🔧 管理专属规则\n\n`;
    message += `群组ID: ${groupId}\n`;
    message += `专属规则数量: ${ruleKeys.length}\n\n`;
    
    if (ruleKeys.length === 0) {
      message += `📝 当前该群组没有配置专属替换规则。\n\n请使用下方按钮添加新规则。`;
    } else {
      // 显示所有专属规则
      ruleKeys.forEach((oldWord, index) => {
        const newWord = groupRules[oldWord];
        message += `${index + 1}. '${oldWord}' → '${newWord}'\n`;
      });
    }
    
    // 创建管理专属规则键盘
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '➕ 添加专属规则', callback_data: `add_group_specific_rule:${groupId}` }
          ],
          [
            { text: '🔙 返回群组规则详情', callback_data: `manage_group_rules:${groupId}` }
          ]
        ]
      }
    };
    
    // 更新消息
    ctx.editMessageText(message, keyboard);
    
    // 结束按钮加载状态
    endButtonLoading(buttonKey);
    
    // 更新消息并跟踪界面
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      const screenKey = `${ctx.from.id}_manage_group_rules_${groupId}`;
      activeScreens.set(screenKey, {
        chatId: ctx.chat.id,
        messageId: ctx.callbackQuery.message.message_id,
        type: 'manage_group_rules'
      });
    }
  } catch (error) {
    console.error('管理专属规则时出错:', error);
    ctx.editMessageText('❌ 处理请求时出错，请稍后重试。', getRuleManagementKeyboard());
  }
};

// 处理添加群组专属规则
const handleAddGroupSpecificRule = (ctx, groupId) => {
  try {
    // 记录用户的期望操作
    if (ctx.session) {
      ctx.session.expecting = 'old_word_for_group_rule';
      ctx.session.currentGroupId = groupId;
    }
    
    ctx.editMessageText(`请输入要替换的文本（旧词）：\n\n群组ID: ${groupId}`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔙 取消', callback_data: `manage_group_specific_rules:${groupId}` }
          ]
        ]
      }
    });
  } catch (error) {
    console.error('处理添加群组专属规则时出错:', error);
    ctx.editMessageText('❌ 处理请求时出错，请稍后重试。', getRuleManagementKeyboard());
  }
};

// 全局的监控状态变量
let monitoringEnabled = true;

// 活跃界面跟踪 - 用于自动刷新功能
const activeScreens = new Map();

// 配置更新回调函数列表
const configUpdateCallbacks = new Map();

// 按钮加载状态跟踪
const buttonLoadingStates = new Map();

// 分页状态跟踪
const paginationStates = new Map();
const ITEMS_PER_PAGE = 10; // 每页显示的项目数量

// 按钮加载状态辅助函数
function startButtonLoading(ctx, callbackData) {
  const buttonKey = `${ctx.chat.id}_${ctx.callbackQuery.message.message_id}_${callbackData}`;
  buttonLoadingStates.set(buttonKey, true);
  
  // 显示加载提示
  ctx.answerCbQuery('⏳ 处理中...', { show_alert: false });
  
  return buttonKey;
}

function endButtonLoading(buttonKey) {
  buttonLoadingStates.delete(buttonKey);
}

function isButtonLoading(buttonKey) {
  return buttonLoadingStates.has(buttonKey);
}

// 分页辅助函数
function getPaginationState(userId, listType) {
  const key = `${userId}_${listType}`;
  if (!paginationStates.has(key)) {
    paginationStates.set(key, { currentPage: 0 });
  }
  return paginationStates.get(key);
}

function setPaginationState(userId, listType, state) {
  const key = `${userId}_${listType}`;
  paginationStates.set(key, state);
}

// 确认对话框辅助函数
function showConfirmationDialog(ctx, title, confirmAction, cancelAction = null, confirmText = '确认', cancelText = '取消') {
  // 生成唯一的回调ID
  const callbackId = `confirm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // 保存确认和取消操作
  ctx.session = ctx.session || {};
  ctx.session.confirmationActions = ctx.session.confirmationActions || {};
  ctx.session.confirmationActions[callbackId] = {
    confirm: confirmAction,
    cancel: cancelAction
  };
  
  // 发送确认消息
  ctx.editMessageText(title, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `✅ ${confirmText}`, callback_data: `confirm_${callbackId}` },
          { text: `❌ ${cancelText}`, callback_data: `cancel_${callbackId}` }
        ]
      ]
    }
  });
}

// 注册配置更新回调函数
function registerConfigUpdateCallback(configType, callback) {
  if (!configUpdateCallbacks.has(configType)) {
    configUpdateCallbacks.set(configType, []);
  }
  configUpdateCallbacks.get(configType).push(callback);
}

// 触发配置更新事件
async function triggerConfigUpdate(configType) {
  if (config.debugMode) {
    console.log(`[配置更新] 触发 ${configType} 类型配置更新事件`);
  }
  
  // 重新加载配置
  config.sourceChatIds = readSourceGroups().filter(group => group.enabled).map(group => group.id);
  config.targetChatIds = readTargetGroup() ? [readTargetGroup()] : [];
  config.textReplaceRules = readReplacementRules();
  pinSettings = readPinConfig();
  
  // 调用对应类型的回调函数
  if (configUpdateCallbacks.has(configType)) {
    const callbacks = configUpdateCallbacks.get(configType);
    for (const callback of callbacks) {
      try {
        await callback();
      } catch (error) {
        console.error(`执行配置更新回调时出错:`, error);
      }
    }
  }
  
  // 刷新所有相关的活跃界面
  await refreshActiveScreens(configType);
}

// 刷新相关的活跃界面
async function refreshActiveScreens(configType) {
  if (config.debugMode) {
    console.log(`[界面刷新] 正在刷新与 ${configType} 相关的活跃界面`);
  }
  
  const screenTypesToRefresh = [];
  
  // 根据配置类型确定需要刷新的界面类型
  switch (configType) {
    case 'source_groups':
      screenTypesToRefresh.push('status_dashboard', 'source_groups_list', 'group_management');
      break;
    case 'target_groups':
      screenTypesToRefresh.push('status_dashboard', 'target_groups_list', 'group_management', 'group_selection');
      break;
    case 'replacement_rules':
      screenTypesToRefresh.push('status_dashboard', 'replacement_rules_list', 'rule_management');
      break;
    case 'pin_settings':
      screenTypesToRefresh.push('status_dashboard', 'group_selection', 'pin_management');
      break;
    default:
      // 刷新所有界面
      screenTypesToRefresh.push('status_dashboard', 'source_groups_list', 'target_groups_list', 
                               'replacement_rules_list', 'group_management', 'rule_management', 
                               'pin_management', 'group_selection');
  }
  
  // 遍历所有活跃界面并刷新符合条件的界面
  for (const [screenKey, screenInfo] of activeScreens.entries()) {
    if (screenTypesToRefresh.includes(screenInfo.type)) {
      try {
        // 根据界面类型调用不同的刷新函数
        switch (screenInfo.type) {
          case 'status_dashboard':
            await bot.telegram.editMessageText(
              screenInfo.chatId,
              screenInfo.messageId,
              undefined,
              generateStatusDashboardMessage(),
              { reply_markup: getBackToMainMenuButton().reply_markup }
            );
            break;
          case 'source_groups_list':
            await bot.telegram.editMessageText(
              screenInfo.chatId,
              screenInfo.messageId,
              undefined,
              generateSourceGroupsListMessage(),
              { reply_markup: getGroupManagementKeyboard().reply_markup }
            );
            break;
          case 'target_groups_list':
            await bot.telegram.editMessageText(
              screenInfo.chatId,
              screenInfo.messageId,
              undefined,
              generateTargetGroupsListMessage(),
              { reply_markup: getGroupManagementKeyboard().reply_markup }
            );
            break;
          case 'replacement_rules_list':
            await bot.telegram.editMessageText(
              screenInfo.chatId,
              screenInfo.messageId,
              undefined,
              generateReplacementRulesListMessage(),
              { reply_markup: getRuleManagementKeyboard().reply_markup }
            );
            break;
          case 'group_selection':
            await bot.telegram.editMessageText(
              screenInfo.chatId,
              screenInfo.messageId,
              undefined,
              `🏠 主页 > ⚙️ 配置管理 > 📌 置顶功能 > 🎯 群组选择\n\n点击下方群组可以切换其置顶状态：\n\n`,
              { reply_markup: getGroupSelectionKeyboard().reply_markup }
            );
            break;
          case 'group_management':
            await bot.telegram.editMessageText(
              screenInfo.chatId,
              screenInfo.messageId,
              undefined,
              `🏠 主页 > ⚙️ 配置管理 > 🎯 群组设置\n\n请选择您需要执行的操作：`,
              { reply_markup: getGroupManagementKeyboard().reply_markup }
            );
            break;
          case 'rule_management':
            await bot.telegram.editMessageText(
              screenInfo.chatId,
              screenInfo.messageId,
              undefined,
              `🏠 主页 > ⚙️ 配置管理 > 📝 替换规则\n\n请选择您需要执行的操作：`,
              { reply_markup: getRuleManagementKeyboard().reply_markup }
            );
            break;
          case 'pin_management':
            await bot.telegram.editMessageText(
              screenInfo.chatId,
              screenInfo.messageId,
              undefined,
              `🏠 主页 > ⚙️ 配置管理 > 📌 置顶功能\n\n请选择您需要执行的操作：`,
              { reply_markup: getPinManagementKeyboard().reply_markup }
            );
            break;
        }
      } catch (error) {
        // 如果消息已被删除或其他错误，从活跃界面列表中移除
        if (error.response?.error_code === 400 || error.response?.error_code === 403) {
          activeScreens.delete(screenKey);
          if (config.debugMode) {
            console.log(`[界面刷新] 消息 ${screenInfo.messageId} 可能已被删除，从活跃列表中移除`);
          }
        } else {
          console.error(`刷新界面时出错 (${screenInfo.chatId}/${screenInfo.messageId}):`, error);
        }
      }
    }
  }
}

// 生成状态看板消息
function generateStatusDashboardMessage() {
  const now = new Date();
  const uptime = process.uptime();
  const uptimeHours = Math.floor(uptime / 3600);
  const uptimeMinutes = Math.floor((uptime % 3600) / 60);
  const uptimeSeconds = Math.floor(uptime % 60);
  
  // 获取源群组和目标群组信息
  const sourceGroups = readSourceGroups();
  const totalSourceGroups = sourceGroups.length;
  const enabledSourceGroups = sourceGroups.filter(g => g.enabled).length;
  
  // 获取置顶配置信息
  const totalPinConfigs = Object.keys(pinSettings).length;
  const enabledPinConfigs = Object.values(pinSettings).filter(s => s.enabled).length;
  
  let statusMessage = `🏠 主页 > 📋 状态看板\n\n`;
  statusMessage += `🗓️ 当前时间：${now.toLocaleString()}\n`;
  statusMessage += `⏱️ 运行时间：${uptimeHours}小时${uptimeMinutes}分钟${uptimeSeconds}秒\n\n`;
  
  statusMessage += `⚙️ 配置概览：\n`;
  statusMessage += `- 源群组总数：${totalSourceGroups}\n`;
  statusMessage += `- 已启用的源群组：${enabledSourceGroups}\n`;
  statusMessage += `- 目标群组数量：${config.targetChatIds.length}\n`;
  statusMessage += `- 替换规则数量：${Object.keys(config.textReplaceRules).length}\n`;
  statusMessage += `- 置顶配置数量：${totalPinConfigs}\n`;
  statusMessage += `- 已启用的置顶配置：${enabledPinConfigs}\n`;
  statusMessage += `- 管理员数量：${config.adminIds.length}\n\n`;
  
  statusMessage += `🔄 系统状态：\n`;
  statusMessage += `- 监控状态：${monitoringEnabled ? '✅ 已开启' : '❌ 已关闭'}\n`;
  statusMessage += `- 调试模式：${config.debugMode ? '✅ 已开启' : '❌ 已关闭'}`;
  
  return statusMessage;
}

// 生成源群组列表消息
function generateSourceGroupsListMessage() {
  const sourceGroups = readSourceGroups();
  
  if (sourceGroups.length === 0) {
    return `🏠 主页 > ⚙️ 配置管理 > 🎯 群组设置 > 📋 源群组列表\n\n当前没有配置任何源群组。\n\n请使用"添加源群组"功能添加群组。`;
  }
  
  let listMessage = `🏠 主页 > ⚙️ 配置管理 > 🎯 群组设置 > 📋 源群组列表 (共 ${sourceGroups.length} 个)\n\n`;
  
  sourceGroups.forEach((group, index) => {
    const statusEmoji = group.enabled ? '✅' : '❌';
    listMessage += `${index + 1}. ID: ${group.id} ${statusEmoji} ${group.enabled ? '已启用' : '已禁用'}\n`;
  });
  
  listMessage += `\n💡 提示：点击"添加源群组"按钮添加新的源群组。`;
  
  return listMessage;
}

// 生成目标群组列表消息
function generateTargetGroupsListMessage() {
  const targetGroup = readTargetGroup();
  
  if (!targetGroup) {
    return `🏠 主页 > ⚙️ 配置管理 > 🎯 群组设置 > 🎯 目标群组列表\n\n当前没有设置目标群组。\n\n请使用"设置目标群组"功能设置目标群组。`;
  }
  
  return `🏠 主页 > ⚙️ 配置管理 > 🎯 群组设置 > 🎯 目标群组列表\n\n当前设置的目标群组：\nID: ${targetGroup}\n\n💡 提示：点击"设置目标群组"按钮修改目标群组。`;
}

// 生成替换规则列表消息
function generateReplacementRulesListMessage() {
  const rules = readReplacementRules();
  const ruleKeys = Object.keys(rules);
  
  if (ruleKeys.length === 0) {
    return `🏠 主页 > ⚙️ 配置管理 > 📝 替换规则 > 📝 替换规则列表\n\n当前没有配置任何文本替换规则。\n\n请使用"添加替换规则"功能添加规则。`;
  }
  
  let ruleMessage = `🏠 主页 > ⚙️ 配置管理 > 📝 替换规则 > 📝 替换规则列表 (共 ${ruleKeys.length} 条)\n\n`;
  
  // 只显示前10条规则，避免消息过长
  const displayRules = ruleKeys.slice(0, 10);
  displayRules.forEach((oldWord, index) => {
    const newWord = rules[oldWord];
    ruleMessage += `${index + 1}. '${oldWord}' → '${newWord}'\n`;
  });
  
  if (ruleKeys.length > 10) {
    ruleMessage += `\n💡 提示：共 ${ruleKeys.length} 条规则，仅显示前10条。\n使用 /list_rules 命令查看完整列表。`;
  }
  
  return ruleMessage;
}

// 清理过期的活跃界面（定期清理或在消息删除时）
function cleanupExpiredScreens() {
  const now = Date.now();
  // 实际实现可以检查消息是否仍然存在，这里简化处理
  // 例如：每10分钟运行一次，清理超过24小时的界面
}

// 监听消息删除事件，从活跃界面列表中移除被删除的消息
bot.on('message_delete', (ctx) => {
  // 实现消息删除监听逻辑
  // 注意：Telegram API的消息删除事件有一些限制
});

// 创建主菜单键盘
function getMainMenuKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📋 状态看板', callback_data: 'status_dashboard' },
          { text: '⚙️ 配置管理', callback_data: 'config_menu' }
        ],
        [
          { text: monitoringEnabled ? '🟢 监控中 (点击关闭)' : '🔴 已停止 (点击开启)', callback_data: 'toggle_monitoring' },
          { text: '❓ 帮助说明', callback_data: 'show_help' }
        ]
      ]
    }
  };
}

// 创建群组选择键盘
function getGroupSelectionKeyboard() {
  const targetGroups = config.targetChatIds;
  const keyboard = { inline_keyboard: [] };
  
  // 添加每个目标群组作为一行按钮
  targetGroups.forEach(chatId => {
    const pinStatus = pinSettings[chatId] && pinSettings[chatId].enabled;
    const statusText = pinStatus ? '✅' : '❌';
    
    keyboard.inline_keyboard.push([
      {
        text: `群组 ${chatId} ${statusText}`,
        callback_data: `toggle_group_pin_${chatId}`
      }
    ]);
  });
  
  // 添加返回按钮
  keyboard.inline_keyboard.push([
    { text: '🔙 返回置顶管理', callback_data: 'pin_management' }
  ]);
  
  return { reply_markup: keyboard };
}

// 创建返回主页按钮
function getBackToMainMenuButton() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🏠 返回主页', callback_data: 'back_to_main' }]
      ]
    }
  };
}

// 创建配置管理二级菜单键盘
function getConfigMenuKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🎯 群组设置', callback_data: 'group_management' },
          { text: '📝 替换规则', callback_data: 'rule_management' }
        ],
        [
          { text: '📌 置顶功能', callback_data: 'pin_management' },
          { text: '🔙 返回主页', callback_data: 'back_to_main' }
        ]
      ]
    }
  };
}

// 创建群组管理键盘
function getGroupManagementKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '➕ 添加源群组', callback_data: 'add_source_group' },
          { text: '🎯 设置目标群组', callback_data: 'set_target_group' }
        ],
        [
          { text: '📋 源群组列表', callback_data: 'list_source_groups' },
          { text: '🎯 目标群组列表', callback_data: 'list_target_groups' }
        ],
        [
          { text: '🔙 返回配置菜单', callback_data: 'config_menu' }
        ]
      ]
    }
  };
}

// 创建替换规则管理键盘
function getRuleManagementKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '➕ 添加替换规则', callback_data: 'add_replacement_rule' },
          { text: '📋 查看替换规则', callback_data: 'view_replacement_rules' }
        ],
        [
          { text: '👥 群组规则设置', callback_data: 'group_rules_settings' }
        ],
        [
          { text: '🔙 返回配置菜单', callback_data: 'config_menu' }
        ]
      ]
    }
  };
}

// 创建置顶功能管理键盘
function getPinManagementKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📌 开启群组置顶', callback_data: 'enable_pin' },
          { text: '❌ 关闭群组置顶', callback_data: 'disable_pin' }
        ],
        [
          { text: '📋 查看置顶状态', callback_data: 'check_pin_status' },
          { text: '🔍 置顶配置详情', callback_data: 'pin_details' }
        ],
        [
          { text: '🎯 群组选择 (快速切换)', callback_data: 'show_group_selection' },
          { text: '🔙 返回配置菜单', callback_data: 'config_menu' }
        ]
      ]
    }
  };
}

// 创建Telegraf实例
const bot = new Telegraf(config.botToken);

// 创建场景管理器
const stage = new Scenes.Stage([]);

// 使用会话中间件
bot.use(session());
bot.use(stage.middleware());

// 创建添加替换规则场景
const addRuleScene = new Scenes.BaseScene('ADD_RULE_SCENE');

// 添加替换规则场景的进入处理
addRuleScene.enter((ctx) => {
  ctx.reply('🏠 主页 > ⚙️ 配置管理 > 📝 替换规则 > ➕ 添加替换规则\n\n请输入您想要替换的原始文本：\n\n取消操作请发送 /cancel', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ 取消', callback_data: 'cancel_scene' }]
      ]
    }
  });
});

// 处理原始文本输入
addRuleScene.on('message', async (ctx) => {
  if (ctx.message.text === '/cancel') {
    ctx.reply('操作已取消。', getRuleManagementKeyboard());
    return ctx.scene.leave();
  }
  
  // 保存原始文本到场景会话
  ctx.scene.session = ctx.scene.session || {};
  ctx.scene.session.oldWord = ctx.message.text.trim();
  
  // 进入第二步：提示输入替换后的文本
  ctx.reply(`🏠 主页 > ⚙️ 配置管理 > 📝 替换规则 > ➕ 添加替换规则\n\n请输入替换后的文本：\n\n原始文本："${ctx.scene.session.oldWord}"\n\n取消操作请发送 /cancel`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ 取消', callback_data: 'cancel_scene' }]
      ]
    }
  });
  
  // 切换到接收替换后文本的阶段
  addRuleScene.hears(/.*/, async (ctx) => {
    if (ctx.message.text === '/cancel') {
      ctx.reply('操作已取消。', getRuleManagementKeyboard());
      return ctx.scene.leave();
    }
    
    const oldWord = ctx.scene.session.oldWord;
    const newWord = ctx.message.text.trim();
    
    try {
      // 读取当前替换规则
      const rules = readReplacementRules();
      
      // 添加新规则
      rules[oldWord] = newWord;
      
      // 保存到文件
      const saved = saveReplacementRules(rules);
      
      if (saved) {
        // 更新运行时配置
        config.textReplaceRules = rules;
        
        ctx.reply(`✅ 替换规则已添加！\n\n原始文本: "${oldWord}"\n替换为: "${newWord}"\n当前替换规则总数: ${Object.keys(rules).length}`, getRuleManagementKeyboard());
        
        // 触发自动刷新
        setTimeout(() => {
          triggerConfigUpdate('replacement_rules');
        }, 100);
      } else {
        ctx.reply('❌ 保存替换规则时出错，请稍后重试。', getRuleManagementKeyboard());
      }
    } catch (error) {
      console.error('添加替换规则时出错:', error);
      ctx.reply('❌ 处理命令时出错，请稍后重试。', getRuleManagementKeyboard());
    }
    
    // 离开场景
    ctx.scene.leave();
  }, true); // true 表示不覆盖之前的监听器
}, true);

// 处理取消按钮回调
addRuleScene.action('cancel_scene', (ctx) => {
  ctx.editMessageText('操作已取消。', getRuleManagementKeyboard());
  ctx.scene.leave();
});

// 注册添加替换规则场景
stage.register(addRuleScene);

// 设置替换规则分页功能
setupReplacementRulesPagination();

// 创建添加群组场景
const addGroupScene = new Scenes.BaseScene('ADD_GROUP_SCENE');

// 添加群组场景的进入处理
addGroupScene.enter((ctx) => {
  ctx.reply('🏠 主页 > ⚙️ 配置管理 > 🎯 群组设置 > ➕ 添加群组\n\n请转发一条来自目标群组的消息给我，我将自动获取群组ID。\n\n取消操作请发送 /cancel', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ 取消', callback_data: 'cancel_scene' }]
      ]
    }
  });
});

// 处理转发消息
addGroupScene.on('message', async (ctx) => {
  if (ctx.message.text === '/cancel') {
    ctx.reply('操作已取消。', getGroupManagementKeyboard());
    return ctx.scene.leave();
  }
  
  // 检查是否为转发消息
  if (!ctx.message.forward_from_chat && !ctx.message.from_chat_id) {
    ctx.reply('🏠 主页 > ⚙️ 配置管理 > 🎯 群组设置 > ➕ 添加群组\n\n❌ 请转发一条有效的群组消息，以便我能获取群组ID。\n\n取消操作请发送 /cancel', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ 取消', callback_data: 'cancel_scene' }]
        ]
      }
    });
    return;
  }
  
  // 获取群组ID
  const chatId = ctx.message.forward_from_chat ? 
    ctx.message.forward_from_chat.id.toString() : 
    ctx.message.from_chat_id.toString();
  
  // 保存群组ID到场景会话
  ctx.scene.session = ctx.scene.session || {};
  ctx.scene.session.chatId = chatId;
  
  // 询问用户群组类型
  ctx.reply(`🏠 主页 > ⚙️ 配置管理 > 🎯 群组设置 > ➕ 添加群组\n\n已获取群组ID: ${chatId}\n\n请选择该群组的类型：`, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📤 源群组', callback_data: 'group_type_source' },
          { text: '📥 目标群组', callback_data: 'group_type_target' }
        ],
        [
          { text: '❌ 取消', callback_data: 'cancel_scene' }
        ]
      ]
    }
  });
  
  // 处理源群组选择
  addGroupScene.action('group_type_source', async (ctx) => {
    const chatId = ctx.scene.session.chatId;
    
    try {
      // 读取当前源群组列表
      let sourceGroups = readSourceGroups();
      
      // 检查群组是否已存在
      const isExisting = sourceGroups.some(group => group.id === chatId);
      
      if (!isExisting) {
        // 添加新的源群组
        sourceGroups.push({ id: chatId, enabled: true });
        const saved = saveSourceGroups(sourceGroups);
        
        if (saved) {
          // 更新运行时配置
          config.sourceChatIds = sourceGroups.map(group => group.id);
          
          ctx.editMessageText(`✅ 源群组已添加成功！\n\n群组ID: ${chatId}\n当前源群组数量: ${sourceGroups.length}`, getGroupManagementKeyboard());
          
          // 触发自动刷新
          setTimeout(() => {
            triggerConfigUpdate('source_groups');
          }, 100);
        } else {
          ctx.editMessageText('❌ 保存源群组时出错，请稍后重试。', getGroupManagementKeyboard());
        }
      } else {
        ctx.editMessageText(`⚠️ 该群组ID ${chatId} 已经是源群组了。`, getGroupManagementKeyboard());
      }
    } catch (error) {
      console.error('添加源群组时出错:', error);
      ctx.editMessageText('❌ 处理命令时出错，请稍后重试。', getGroupManagementKeyboard());
    }
    
    // 离开场景
    ctx.scene.leave();
  });
  
  // 处理目标群组选择
  addGroupScene.action('group_type_target', async (ctx) => {
    const chatId = ctx.scene.session.chatId;
    
    try {
      // 设置目标群组
      const saved = saveTargetGroup(chatId);
      
      if (saved) {
          // 更新运行时配置
          config.targetChatIds = [chatId];
          
          ctx.editMessageText(`✅ 目标群组已设置成功！\n\n群组ID: ${chatId}`, getGroupManagementKeyboard());
          
          // 触发自动刷新
          setTimeout(() => {
            triggerConfigUpdate('target_groups');
          }, 100);
        } else {
        ctx.editMessageText('❌ 保存目标群组时出错，请稍后重试。', getGroupManagementKeyboard());
      }
    } catch (error) {
      console.error('设置目标群组时出错:', error);
      ctx.editMessageText('❌ 处理命令时出错，请稍后重试。', getGroupManagementKeyboard());
    }
    
    // 离开场景
    ctx.scene.leave();
  });
  
  // 处理取消按钮回调
  addGroupScene.action('cancel_scene', (ctx) => {
    ctx.editMessageText('操作已取消。', getGroupManagementKeyboard());
    ctx.scene.leave();
  });
}, true);

// 注册添加群组场景
stage.register(addGroupScene);

// 启动消息
console.log(`${config.botName} 正在启动...`);

// 检查必要的环境变量是否设置
if (config.sourceChatIds.length === 0) {
  console.warn('警告：环境变量 SOURCE_CHAT_IDS 或 SOURCE_CHAT_ID 未设置');
} else {
  console.log(`监听的源群组ID：${config.sourceChatIds.join(', ')}`);
}

if (config.targetChatIds.length === 0) {
  console.warn('警告：环境变量 TARGET_CHAT_IDS 或 TARGET_CHAT_ID 未设置');
} else {
  console.log(`转发的目标群组ID：${config.targetChatIds.join(', ')}`);
}

// 显示管理员配置信息
if (config.adminIds.length > 0) {
  console.log(`配置的管理员ID：${config.adminIds.join(', ')}`);
} else {
  console.log('未配置管理员，所有命令将对所有用户开放');
}

// 显示加载的文本替换规则数量
console.log(`加载了 ${Object.keys(config.textReplaceRules).length} 条文本替换规则`);

// 管理员验证中间件
function isAdmin(ctx, next) {
  // 如果没有配置管理员列表，则所有用户都可以执行管理命令
  if (config.adminIds.length === 0) {
    return next();
  }
  
  // 检查用户ID是否在管理员列表中
  const userId = ctx.from.id.toString();
  if (config.adminIds.includes(userId)) {
    return next();
  }
  
  // 非管理员用户，拒绝执行命令
  ctx.reply('❌ 您没有权限执行此命令。');
  return;
}

// 文件操作辅助函数

// 读取源群组列表 - 返回包含ID和状态的对象数组
function readSourceGroups() {
  try {
    const filePath = path.join(__dirname, 'sources.json');
    if (!fs.existsSync(filePath)) {
      // 如果文件不存在，返回空数组
      return [];
    }
    const data = fs.readFileSync(filePath, 'utf8');
    const sourceGroups = JSON.parse(data);
    
    // 兼容旧格式：如果是简单ID数组，转换为对象数组
    if (sourceGroups.length > 0 && typeof sourceGroups[0] === 'string') {
      return sourceGroups.map(id => ({ id, enabled: true }));
    }
    
    return sourceGroups;
  } catch (error) {
    console.error('读取源群组列表时出错:', error);
    return [];
  }
}

// 读取替换规则 - 从replacement_rules.json文件加载
function readReplacementRules() {
  try {
    const filePath = path.join(__dirname, 'replacement_rules.json');
    if (!fs.existsSync(filePath)) {
      // 如果文件不存在，返回空对象
      console.log('replacement_rules.json文件不存在，返回空替换规则');
      return {};
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('读取替换规则时出错:', error);
    return {};
  }
}

// 保存替换规则 - 保存到replacement_rules.json文件
function saveReplacementRules(rules) {
  try {
    const filePath = path.join(__dirname, 'replacement_rules.json');
    fs.writeFileSync(filePath, JSON.stringify(rules, null, 2), 'utf8');
    
    // 触发配置更新事件，刷新相关界面
    setTimeout(() => {
      triggerConfigUpdate('replacement_rules');
    }, 100);
    
    return true;
  } catch (error) {
    console.error('保存替换规则时出错:', error);
    return false;
  }
}

// 保存源群组列表
function saveSourceGroups(sourceGroups) {
  try {
    const filePath = path.join(__dirname, 'sources.json');
    fs.writeFileSync(filePath, JSON.stringify(sourceGroups, null, 2), 'utf8');
    
    // 触发配置更新事件，刷新相关界面
    setTimeout(() => {
      triggerConfigUpdate('source_groups');
    }, 100);
    
    return true;
  } catch (error) {
    console.error('保存源群组列表时出错:', error);
    return false;
  }
}

// 读取目标群组
function readTargetGroup() {
  try {
    const filePath = path.join(__dirname, 'target.json');
    if (!fs.existsSync(filePath)) {
      // 如果文件不存在，返回空
      return null;
    }
    const data = fs.readFileSync(filePath, 'utf8');
    const targetData = JSON.parse(data);
    return targetData.chatId || null;
  } catch (error) {
    console.error('读取目标群组时出错:', error);
    return null;
  }
}

// 保存目标群组
function saveTargetGroup(chatId) {
  try {
    const filePath = path.join(__dirname, 'target.json');
    fs.writeFileSync(filePath, JSON.stringify({ chatId }, null, 2), 'utf8');
    
    // 触发配置更新事件，刷新相关界面
    setTimeout(() => {
      triggerConfigUpdate('target_groups');
    }, 100);
    
    return true;
  } catch (error) {
    console.error('保存目标群组时出错:', error);
    return false;
  }
}

// 群组级规则管理辅助函数

// 读取群组规则配置文件
function readGroupRulesConfig() {
  try {
    const filePath = path.join(__dirname, 'group_rules_config.json');
    if (!fs.existsSync(filePath)) {
      // 如果文件不存在，返回默认配置
      console.log('group_rules_config.json文件不存在，返回默认配置');
      return {
        global_rules: {},
        group_specific_rules: {},
        disabled_groups: []
      };
    }
    const data = fs.readFileSync(filePath, 'utf8');
    const config = JSON.parse(data);
    
    // 确保配置结构完整
    return {
      global_rules: config.global_rules || {},
      group_specific_rules: config.group_specific_rules || {},
      disabled_groups: config.disabled_groups || []
    };
  } catch (error) {
    console.error('读取群组规则配置时出错:', error);
    return {
      global_rules: {},
      group_specific_rules: {},
      disabled_groups: []
    };
  }
}

// 保存群组规则配置文件
function saveGroupRulesConfig(config) {
  try {
    const filePath = path.join(__dirname, 'group_rules_config.json');
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
    
    // 刷新缓存
    refreshRulesConfigCache();
    
    // 触发配置更新事件，刷新相关界面
    setTimeout(() => {
      triggerConfigUpdate('replacement_rules');
    }, 100);
    
    return true;
  } catch (error) {
    console.error('保存群组规则配置时出错:', error);
    return false;
  }
}

// 获取指定群组的有效规则（合并全局规则和群组特定规则） - 保持向后兼容性
function getEffectiveRulesForGroup(groupId) {
  // 同步版本，用于不支持异步调用的地方
  const config = getCachedGroupRulesConfig();
  
  // 检查群组是否被禁用
  if (config.disabled_groups.includes(groupId)) {
    return {}; // 返回空对象，表示完全禁用规则
  }
  
  // 获取群组特定规则
  const groupRules = config.group_specific_rules[groupId] || { enabled: true, inherit_global: true, rules: {} };
  
  // 如果群组特定规则被禁用，返回空对象
  if (!groupRules.enabled) {
    return {};
  }
  
  // 创建结果规则对象
  const effectiveRules = {};
  
  // 如果继承全局规则，先复制全局规则
  if (groupRules.inherit_global) {
    Object.assign(effectiveRules, config.global_rules);
  }
  
  // 然后应用群组特定规则（优先级高于全局规则）
  Object.assign(effectiveRules, groupRules.rules);
  
  return effectiveRules;
}

// 获取指定群组的有效规则（合并全局规则和群组特定规则） - 重构后的主要函数
async function getEffectiveRules(chatId) {
  try {
    // 获取缓存的配置或重新加载
    const config = getCachedGroupRulesConfig();
    
    // 检查群组是否被禁用
    if (config.disabled_groups.includes(chatId)) {
      return {}; // 返回空对象，表示完全禁用规则
    }
    
    // 获取群组特定规则
    const groupRules = config.group_specific_rules[chatId] || { enabled: true, inherit_global: true, rules: {} };
    
    // 如果群组特定规则被禁用，返回空对象
    if (!groupRules.enabled) {
      return {};
    }
    
    // 创建结果规则对象
    const effectiveRules = {};
    
    // 如果继承全局规则，先复制全局规则
    if (groupRules.inherit_global) {
      Object.assign(effectiveRules, config.global_rules);
    }
    
    // 然后应用群组特定规则（优先级高于全局规则）
    Object.assign(effectiveRules, groupRules.rules);
    
    return effectiveRules;
  } catch (error) {
    console.error('获取有效规则时出错:', error);
    return {};
  }
}

// 获取缓存的群组规则配置，如果缓存过期则重新加载
function getCachedGroupRulesConfig() {
  const now = Date.now();
  
  // 检查缓存是否有效
  if (rulesConfigCache && (now - rulesConfigLastUpdated) < RULES_CACHE_TTL) {
    return rulesConfigCache;
  }
  
  // 缓存过期，重新加载配置
  rulesConfigCache = readGroupRulesConfig();
  rulesConfigLastUpdated = now;
  
  return rulesConfigCache;
}

// 刷新规则配置缓存（在配置更新时调用）
function refreshRulesConfigCache() {
  rulesConfigCache = null;
  rulesConfigLastUpdated = 0;
}

// 读取置顶配置
function readPinConfig() {
  try {
    const filePath = path.join(__dirname, 'pin_config.json');
    if (!fs.existsSync(filePath)) {
      // 如果文件不存在，返回空对象
      console.log('pin_config.json文件不存在，返回空置顶配置');
      return {};
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('读取置顶配置时出错:', error);
    return {};
  }
}

// 保存置顶配置
function savePinConfig(settings) {
  try {
    const filePath = path.join(__dirname, 'pin_config.json');
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf8');
    
    // 触发配置更新事件，刷新相关界面
    setTimeout(() => {
      triggerConfigUpdate('pin_settings');
    }, 100);
    
    return true;
  } catch (error) {
    console.error('保存置顶配置时出错:', error);
    return false;
  }
}

// 初始化群组配置
function initGroupConfig() {
  console.log('开始初始化群组配置...');
  
  // 从sources.json加载源群组列表
  const sourceGroups = readSourceGroups();
  if (sourceGroups.length === 0 && config.sourceChatIds.length > 0) {
    // 如果是从环境变量初始化，转换为带状态的对象数组
    const sourceGroupsWithStatus = config.sourceChatIds.map(id => ({ id, enabled: true }));
    saveSourceGroups(sourceGroupsWithStatus);
    console.log('已从环境变量初始化源群组配置到sources.json');
  }
  
  // 从target.json加载目标群组
  const targetGroup = readTargetGroup();
  if (!targetGroup && config.targetChatIds.length > 0) {
    saveTargetGroup(config.targetChatIds[0]);
    console.log('已从环境变量初始化目标群组配置到target.json');
  }
  
  // 读取替换规则文件，确保规则在运行时正确加载
  const rules = readReplacementRules();
  if (Object.keys(rules).length === 0 && Object.keys(config.textReplaceRules).length > 0) {
    // 如果文件中没有规则，但配置中有默认规则，则保存默认规则到文件
    saveReplacementRules(config.textReplaceRules);
    console.log('已从默认配置初始化替换规则到replacement_rules.json');
  }
  
  // 读取置顶配置文件
  pinSettings = readPinConfig();
  console.log(`已加载置顶配置：共 ${Object.keys(pinSettings).length} 个群组配置了置顶设置`);
  
  // 更新运行时配置
  const groupsData = readSourceGroups();
  // 只包含启用状态的源群组ID
  config.sourceChatIds = groupsData.filter(group => group.enabled).map(group => group.id);
  
  const targetChatId = readTargetGroup();
  config.targetChatIds = targetChatId ? [targetChatId] : [];
  config.textReplaceRules = readReplacementRules();
  
  console.log(`初始化完成：监控 ${config.sourceChatIds.length} 个源群组（共配置了 ${groupsData.length} 个源群组），转发到 ${config.targetChatIds.length} 个目标群组，加载了 ${Object.keys(config.textReplaceRules).length} 条替换规则，配置了 ${Object.keys(pinSettings).filter(id => pinSettings[id]).length} 个群组的置顶功能`);

  // 迁移旧的替换规则到新的群组规则配置
  migrateOldRulesToGroupRules();
}

// 迁移旧的替换规则到新的群组规则配置
function migrateOldRulesToGroupRules() {
  try {
    // 读取旧的替换规则
    const oldRules = readReplacementRules();
    
    // 读取新的群组规则配置
    const groupRulesConfig = readGroupRulesConfig();
    
    // 检查是否有旧的规则需要迁移
    const oldRuleKeys = Object.keys(oldRules);
    const globalRuleKeys = Object.keys(groupRulesConfig.global_rules);
    
    // 如果有旧规则，且新配置中没有对应的全局规则，则进行迁移
    let needMigration = false;
    for (const oldKey of oldRuleKeys) {
      if (!globalRuleKeys.includes(oldKey)) {
        needMigration = true;
        break;
      }
    }
    
    if (needMigration) {
      console.log('发现需要迁移的旧替换规则，开始迁移...');
      
      // 合并旧规则到全局规则（新规则优先级更高）
      const mergedGlobalRules = { ...oldRules, ...groupRulesConfig.global_rules };
      
      // 更新配置
      groupRulesConfig.global_rules = mergedGlobalRules;
      
      // 保存更新后的配置
      const saveResult = saveGroupRulesConfig(groupRulesConfig);
      
      if (saveResult) {
        console.log(`成功迁移 ${oldRuleKeys.length} 条旧替换规则到全局规则`);
        
        // 更新运行时配置
        config.textReplaceRules = mergedGlobalRules;
      } else {
        console.error('保存迁移后的群组规则配置时出错');
      }
    } else {
      console.log('无需迁移旧替换规则，或已完成迁移');
      
      // 确保运行时配置使用最新的全局规则
      config.textReplaceRules = groupRulesConfig.global_rules;
    }
  } catch (error) {
    console.error('迁移旧替换规则时出错:', error);
  }
}

// 初始化群组配置
initGroupConfig();

// 基本命令处理

// /start 命令 - 显示主菜单
bot.start((ctx) => {
  // 重置用户的菜单层级
  if (ctx.session) {
    ctx.session.menuLevel = 'main';
  }
  
  const welcomeMessage = `🏠 主页\n\n欢迎使用 ${config.botName}！\n\n这是一个群组消息转发机器人，支持文本替换和置顶功能。\n\n请从下方菜单选择您需要的操作：`;
  
  ctx.reply(welcomeMessage, getMainMenuKeyboard());
});

// /menu 命令 - 显示主菜单
bot.command('menu', (ctx) => {
  // 重置用户的菜单层级
  if (ctx.session) {
    ctx.session.menuLevel = 'main';
  }
  
  ctx.reply('🏠 主页\n\n请选择您需要的操作：', getMainMenuKeyboard());
});

// /help 命令 - 显示帮助信息
bot.help((ctx) => {
  const sourceGroups = config.sourceChatIds.length > 0 ? config.sourceChatIds.join('\n') : '未设置';
  const targetGroups = config.targetChatIds.length > 0 ? config.targetChatIds.join('\n') : '未设置';
  const hasAdmins = config.adminIds.length > 0;
  
  let helpMessage = `帮助信息：\n\n通用命令：\n/start - 显示欢迎消息和配置状态\n/help - 查看帮助信息\n\n当前配置：\n源群组ID：\n${sourceGroups}\n\n目标群组ID：\n${targetGroups}\n\n机器人功能：\n- 自动监听源群组的消息\n- 对文本消息应用替换规则\n- 将消息转发到所有目标群组\n- 忽略机器人自己发送的消息，避免循环转发\n\n`;
  
  // 如果配置了管理员，显示管理命令
  if (hasAdmins) {
    helpMessage += `管理命令（仅管理员可用）：\n`;
    
    // 列出所有管理命令的格式和功能
    helpMessage += `/admin_status - 查看机器人详细状态\n`;
    helpMessage += `/admin_debug - 切换调试模式\n`;
    helpMessage += `/admin_list - 查看所有管理员ID\n`;
    helpMessage += `/add_source <chat_id> - 添加源群组\n`;
    helpMessage += `/list_sources - 列出所有源群组\n`;
    helpMessage += `/remove_source <chat_id> - 移除源群组\n`;
    helpMessage += `/toggle_source <chat_id> - 切换源群组的监控状态\n`;
    helpMessage += `/pin_on <target_chat_id> [disable_notification] - 开启目标群组的消息置顶功能\n`;
    helpMessage += `/pin_off <target_chat_id> - 关闭目标群组的消息置顶功能\n`;
    helpMessage += `/pin_status - 查看所有群组的置顶功能状态\n`;
    helpMessage += `/pin_detail - 查看每个群组的置顶配置详情\n`;
    helpMessage += `/set_target <chat_id> - 设置目标群组\n`;
    helpMessage += `/add_rule <旧词> <新词> - 添加文本替换规则\n`;
    helpMessage += `/list_rules - 列出所有文本替换规则\n`;
    helpMessage += `/remove_rule <旧词> - 移除文本替换规则\n`;
    helpMessage += `/export_config - 导出所有配置到JSON文件\n`;
    helpMessage += `/import_config - 从JSON文件导入配置（需回复文件）\n`;
    
    const isUserAdmin = config.adminIds.includes(ctx.from.id.toString());
    if (!isUserAdmin) {
      helpMessage += `\n💡 提示：您当前不是管理员，无法执行管理命令。`;
    }
  }
  
  ctx.reply(helpMessage);
});

// 群组管理命令

// /add_source 命令 - 添加源群组
// 格式：/add_source <chat_id>
bot.command('add_source', isAdmin, async (ctx) => {
  try {
    // 解析参数
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      return ctx.reply('❌ 用法错误！请使用：/add_source <chat_id>');
    }
    
    // 验证chat_id格式
    const chatId = args[1].trim();
    if (!chatId || !/^-?\d+$/.test(chatId)) {
      return ctx.reply('❌ 无效的群组ID！请输入正确的数字ID。');
    }
    
    // 读取当前源群组列表
    const sourceGroups = readSourceGroups();
    
    // 检查是否已存在
    if (sourceGroups.some(group => group.id === chatId)) {
      return ctx.reply('⚠️ 该群组ID已在监控列表中，请勿重复添加。');
    }
    
    // 添加新的源群组（默认启用）
    sourceGroups.push({ id: chatId, enabled: true });
    
    // 保存到文件
    const saved = saveSourceGroups(sourceGroups);
    
    if (saved) {
      // 更新运行时配置
      config.sourceChatIds = sourceGroups.filter(group => group.enabled).map(group => group.id);
      
      ctx.reply(`✅ 源群组已添加并启用！\n\n群组ID: ${chatId}\n当前启用的源群组数量: ${config.sourceChatIds.length}\n总配置的源群组数量: ${sourceGroups.length}`);
      
      if (config.debugMode) {
        console.log(`[源群组已添加] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 添加并启用群组 ${chatId}`);
      }
    } else {
      ctx.reply('❌ 保存源群组时出错，请稍后重试。');
    }
  } catch (error) {
    console.error('处理添加源群组命令时出错:', error);
    ctx.reply('❌ 处理命令时出错，请稍后重试。');
  }
});

// /list_sources 命令 - 列出所有源群组
// 格式：/list_sources
bot.command('list_sources', isAdmin, async (ctx) => {
  try {
    // 读取源群组列表
    const sourceGroups = readSourceGroups();
    const enabledCount = sourceGroups.filter(group => group.enabled).length;
    
    if (sourceGroups.length === 0) {
      return ctx.reply('📝 当前没有配置任何监控的源群组。\n\n使用 /add_source <chat_id> 添加源群组。');
    }
    
    // 格式化源群组列表
    let sourcesList = `👁️ 源群组配置列表 (共 ${sourceGroups.length} 个，其中 ${enabledCount} 个已启用)\n\n`;
    
    sourceGroups.forEach((group, index) => {
      const status = group.enabled ? '✅ 启用' : '❌ 禁用';
      sourcesList += `${index + 1}. ${group.id} - ${status}\n`;
    });
    
    sourcesList += `\n💡 提示：\n- 使用 /add_source <chat_id> 添加新的源群组\n- 使用 /remove_source <chat_id> 移除源群组\n- 使用 /toggle_source <chat_id> 切换源群组的监控状态`;
    
    ctx.reply(sourcesList);
  } catch (error) {
    console.error('处理列出源群组命令时出错:', error);
    ctx.reply('❌ 处理命令时出错，请稍后重试。');
  }
});

// /remove_source 命令 - 移除源群组
// 格式：/remove_source <chat_id>
bot.command('remove_source', isAdmin, async (ctx) => {
  try {
    // 解析参数
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      return ctx.reply('❌ 用法错误！请使用：/remove_source <chat_id>');
    }
    
    // 验证chat_id格式
    const chatId = args[1].trim();
    if (!chatId || !/^-?\d+$/.test(chatId)) {
      return ctx.reply('❌ 无效的群组ID！请输入正确的数字ID。');
    }
    
    // 读取当前源群组列表
    let sourceGroups = readSourceGroups();
    
    // 检查是否存在
    const groupIndex = sourceGroups.findIndex(group => group.id === chatId);
    if (groupIndex === -1) {
      return ctx.reply(`⚠️ 未找到群组ID ${chatId}，请确认ID是否正确。`);
    }
    
    // 移除源群组
    sourceGroups.splice(groupIndex, 1);
    
    // 保存到文件
    const saved = saveSourceGroups(sourceGroups);
    
    if (saved) {
      // 更新运行时配置
      config.sourceChatIds = sourceGroups.filter(group => group.enabled).map(group => group.id);
      
      ctx.reply(`✅ 源群组已移除！\n\n群组ID: ${chatId}\n剩余启用的源群组数量: ${config.sourceChatIds.length}\n剩余总配置的源群组数量: ${sourceGroups.length}`);
      
      if (config.debugMode) {
        console.log(`[源群组已移除] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 移除群组 ${chatId}`);
      }
    } else {
      ctx.reply('❌ 保存源群组时出错，请稍后重试。');
    }
  } catch (error) {
    console.error('处理移除源群组命令时出错:', error);
    ctx.reply('❌ 处理命令时出错，请稍后重试。');
  }
});

// /toggle_source 命令 - 切换源群组的监控状态
// 格式：/toggle_source <chat_id>
bot.command('toggle_source', isAdmin, async (ctx) => {
  try {
    // 解析参数
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      return ctx.reply('❌ 用法错误！请使用：/toggle_source <chat_id>');
    }
    
    // 验证chat_id格式
    const chatId = args[1].trim();
    if (!chatId || !/^-?\d+$/.test(chatId)) {
      return ctx.reply('❌ 无效的群组ID！请输入正确的数字ID。');
    }
    
    // 读取当前源群组列表
    const sourceGroups = readSourceGroups();
    
    // 查找群组
    const group = sourceGroups.find(g => g.id === chatId);
    if (!group) {
      return ctx.reply(`⚠️ 未找到群组ID ${chatId}，请确认ID是否正确。`);
    }
    
    // 切换状态
    const newStatus = !group.enabled;
    group.enabled = newStatus;
    
    // 保存到文件
    const saved = saveSourceGroups(sourceGroups);
    
    if (saved) {
      // 更新运行时配置
      config.sourceChatIds = sourceGroups.filter(g => g.enabled).map(g => g.id);
      
      const statusText = newStatus ? '启用' : '禁用';
      const statusEmoji = newStatus ? '✅' : '❌';
      
      ctx.reply(`${statusEmoji} 源群组监控状态已${statusText}！\n\n群组ID: ${chatId}\n当前状态: ${statusText}\n启用的源群组总数: ${config.sourceChatIds.length}`);
      
      if (config.debugMode) {
        console.log(`[源群组状态切换] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 将群组 ${chatId} ${statusText}`);
      }
    } else {
      ctx.reply('❌ 保存源群组状态时出错，请稍后重试。');
    }
  } catch (error) {
    console.error('处理切换源群组状态命令时出错:', error);
    ctx.reply('❌ 处理命令时出错，请稍后重试。');
  }
});

// 置顶功能管理命令

// /pin_on 命令 - 开启目标群组的消息置顶功能
// 格式：/pin_on <target_chat_id>
bot.command('pin_on', isAdmin, async (ctx) => {
  try {
    // 解析参数
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      return ctx.reply('❌ 用法错误！请使用：/pin_on <target_chat_id>');
    }
    
    // 验证群组ID格式
    const targetChatId = args[1].trim();
    if (!targetChatId || !/^-?\d+$/.test(targetChatId)) {
      return ctx.reply('❌ 无效的群组ID！请输入正确的数字ID。');
    }
    
    // 权限预检查
    const permissionResult = await checkPinPermissions(targetChatId);
    if (!permissionResult.hasPermission) {
      if (permissionResult.error) {
        return ctx.reply(`❌ 无法开启置顶：${permissionResult.error}`);
      }
      return ctx.reply('❌ 无法开启置顶：Bot在该群组不是管理员或无置顶权限');
    }
    
    // 更新置顶配置
    pinSettings[targetChatId] = true;
    
    // 保存到文件
    const saved = savePinConfig(pinSettings);
    
    if (saved) {
      ctx.reply(`✅ 已在群组 ${targetChatId} 开启转发消息置顶功能`);
      
      if (config.debugMode) {
        console.log(`[置顶功能已开启] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 在群组 ${targetChatId} 开启置顶`);
      }
    } else {
      ctx.reply('❌ 保存置顶配置时出错，请稍后重试。');
    }
  } catch (error) {
    console.error('处理开启置顶命令时出错:', error);
    ctx.reply('❌ 处理命令时出错，请稍后重试。');
  }
});

// /pin_off 命令 - 关闭目标群组的消息置顶功能
// 格式：/pin_off <target_chat_id>
bot.command('pin_off', isAdmin, async (ctx) => {
  try {
    // 解析参数
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      return ctx.reply('❌ 用法错误！请使用：/pin_off <target_chat_id>');
    }
    
    // 验证群组ID格式
    const targetChatId = args[1].trim();
    if (!targetChatId || !/^-?\d+$/.test(targetChatId)) {
      return ctx.reply('❌ 无效的群组ID！请输入正确的数字ID。');
    }
    
    // 检查群组是否在配置中
    if (!pinSettings[targetChatId] || !pinSettings[targetChatId].enabled) {
      return ctx.reply(`⚠️ 群组 ${targetChatId} 的置顶功能尚未开启，无需关闭。`);
    }
    
    // 更新置顶配置
    delete pinSettings[targetChatId];
    
    // 保存到文件
    const saved = savePinConfig(pinSettings);
    
    if (saved) {
      ctx.reply(`✅ 已在群组 ${targetChatId} 关闭转发消息置顶功能`);
      
      if (config.debugMode) {
        console.log(`[置顶功能已关闭] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 在群组 ${targetChatId} 关闭置顶`);
      }
    } else {
      ctx.reply('❌ 保存置顶配置时出错，请稍后重试。');
    }
  } catch (error) {
    console.error('处理关闭置顶命令时出错:', error);
    ctx.reply('❌ 处理命令时出错，请稍后重试。');
  }
});

// /pin_status 命令 - 查看所有群组的置顶功能状态
// 格式：/pin_status
bot.command('pin_status', isAdmin, async (ctx) => {
  try {
    // 读取当前置顶配置
    const currentPinSettings = readPinConfig();
    const chatIds = Object.keys(currentPinSettings);
    
    if (chatIds.length === 0) {
      return ctx.reply('📌 当前没有配置任何群组的置顶功能。\n\n使用 /pin_on <target_chat_id> 开启置顶功能。');
    }
    
    // 格式化置顶状态列表
    let statusList = `📌 置顶功能状态：\n\n`;
    let enabledCount = 0;
    
    chatIds.forEach((chatId, index) => {
      const settings = currentPinSettings[chatId];
      const isEnabled = settings && settings.enabled;
      const statusEmoji = isEnabled ? '✅' : '❌';
      const statusText = isEnabled ? '开启' : '关闭';
      
      if (isEnabled) {
        enabledCount++;
      }
      
      statusList += `• 群组 ${chatId}: ${statusEmoji} ${statusText}\n`;
    });
    
    statusList += `\n💡 统计信息：\n- 总配置群组数量：${chatIds.length}\n- 开启置顶的群组数量：${enabledCount}\n- 关闭置顶的群组数量：${chatIds.length - enabledCount}`;
    
    statusList += `\n\n操作命令：\n/pin_on <target_chat_id> - 开启置顶功能\n/pin_off <target_chat_id> - 关闭置顶功能\n/pin_detail - 查看置顶配置详情`;
    
    ctx.reply(statusList);
  } catch (error) {
    console.error('处理查看置顶状态命令时出错:', error);
    ctx.reply('❌ 处理命令时出错，请稍后重试。');
  }
});

// /pin_detail 命令 - 查看每个群组的置顶配置详情
bot.command('pin_detail', isAdmin, async (ctx) => {
  try {
    // 读取当前置顶配置
    const currentPinSettings = readPinConfig();
    const chatIds = Object.keys(currentPinSettings);
    
    if (chatIds.length === 0) {
      return ctx.reply('📌 当前没有配置任何群组的置顶功能。\n\n使用 /pin_on <target_chat_id> 开启置顶功能。');
    }
    
    // 构建详细配置信息
    let detailMessage = '📊 置顶配置详情：\n\n';
    
    chatIds.forEach((chatId) => {
      const settings = currentPinSettings[chatId];
      const statusEmoji = settings && settings.enabled ? '✅' : '❌';
      const statusText = settings && settings.enabled ? '开启' : '关闭';
      const notificationStatus = settings && settings.disableNotification ? '不通知' : '通知';
      
      detailMessage += `🔹 群组ID：${chatId}\n`;
      detailMessage += `   • 置顶状态：${statusEmoji} ${statusText}\n`;
      detailMessage += `   • 通知设置：${notificationStatus}群成员\n\n`;
    });
    
    // 添加统计信息
    const enabledCount = Object.values(currentPinSettings).filter(s => s && s.enabled).length;
    const disableNotifyCount = Object.values(currentPinSettings).filter(s => s && s.enabled && s.disableNotification).length;
    
    detailMessage += '📈 统计摘要：\n';
    detailMessage += `- 总配置群组数量：${chatIds.length}\n`;
    detailMessage += `- 开启置顶的群组数量：${enabledCount}\n`;
    detailMessage += `- 开启置顶且不通知的群组数量：${disableNotifyCount}`;
    
    ctx.reply(detailMessage);
  } catch (error) {
    console.error('处理查看置顶配置详情命令时出错:', error);
    ctx.reply('❌ 处理命令时出错，请稍后重试。');
  }
});

// /set_target 命令 - 设置目标群组
// 格式：/set_target <chat_id>
bot.command('set_target', isAdmin, async (ctx) => {
  try {
    // 解析参数
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      return ctx.reply('❌ 用法错误！请使用：/set_target <chat_id>');
    }
    
    // 验证chat_id格式
    const chatId = args[1].trim();
    if (!chatId || !/^-?\d+$/.test(chatId)) {
      return ctx.reply('❌ 无效的群组ID！请输入正确的数字ID。');
    }
    
    // 保存到文件
    const saved = saveTargetGroup(chatId);
    
    if (saved) {
      // 更新运行时配置
      config.targetChatIds = [chatId];
      
      ctx.reply(`✅ 目标群组已设置！\n\n群组ID: ${chatId}\n消息将转发到该群组。`);
      
      if (config.debugMode) {
        console.log(`[目标群组已设置] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 设置群组 ${chatId}`);
      }
    } else {
      ctx.reply('❌ 保存目标群组时出错，请稍后重试。');
    }
  } catch (error) {
    console.error('处理设置目标群组命令时出错:', error);
    ctx.reply('❌ 处理命令时出错，请稍后重试。');
  }
});

// 替换规则管理命令

// /add_rule 命令 - 添加替换规则（支持全局和群组特定规则）
// 格式：/add_rule <旧词> <新词> [群组ID]
bot.command('add_rule', isAdmin, async (ctx) => {
  try {
    // 解析参数
    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
      return ctx.reply('❌ 用法错误！请使用：/add_rule <旧词> <新词> [群组ID]\n\n示例：\n- 添加全局规则：/add_rule 你好 您好\n- 添加群组特定规则：/add_rule 你好 您好 -1001234567890');
    }
    
    // 获取参数
    const oldWord = args[1].trim();
    let newWord, targetGroupId;
    
    // 检查是否指定了群组ID（以-开头）
    const groupIdIndex = args.findIndex(arg => arg.startsWith('-'));
    if (groupIdIndex > 2) {
      // 有指定群组ID
      newWord = args.slice(2, groupIdIndex).join(' ').trim();
      targetGroupId = args[groupIdIndex].trim();
      // 验证群组ID格式
      if (!/^-?\d+$/.test(targetGroupId)) {
        return ctx.reply('❌ 无效的群组ID！请输入正确的数字ID。');
      }
    } else {
      // 没有指定群组ID，添加为全局规则
      newWord = args.slice(2).join(' ').trim();
      targetGroupId = null;
    }
    
    // 验证参数
    if (!oldWord || !newWord) {
      return ctx.reply('❌ 无效的替换规则！旧词和新词不能为空。');
    }
    
    // 读取群组规则配置
    const groupRulesConfig = readGroupRulesConfig();
    
    if (targetGroupId) {
      // 添加群组特定规则
      if (!groupRulesConfig.group_specific_rules[targetGroupId]) {
        groupRulesConfig.group_specific_rules[targetGroupId] = {
          enabled: true,
          inherit_global: true,
          rules: {}
        };
      }
      
      // 检查是否已存在相同规则
      if (groupRulesConfig.group_specific_rules[targetGroupId].rules[oldWord] === newWord) {
        return ctx.reply(`⚠️ 在群组 ${targetGroupId} 中，替换规则 '${oldWord}' -> '${newWord}' 已存在，无需重复添加。`);
      }
      
      // 检查是否与全局规则冲突
      let conflictWarning = '';
      if (groupRulesConfig.global_rules[oldWord] && groupRulesConfig.global_rules[oldWord] !== newWord) {
        conflictWarning = `\n\n⚠️ 注意：该规则与全局规则冲突，在群组 ${targetGroupId} 中，将优先使用本群组规则。\n全局规则: '${oldWord}' -> '${groupRulesConfig.global_rules[oldWord]}'`;
      }
      
      // 添加或更新替换规则
      groupRulesConfig.group_specific_rules[targetGroupId].rules[oldWord] = newWord;
      
      // 保存配置
      const saved = saveGroupRulesConfig(groupRulesConfig);
      
      if (saved) {
        ctx.reply(`✅ 群组特定替换规则已添加！\n\n目标群组: ${targetGroupId}\n'${oldWord}' 将被替换为 '${newWord}'\n该群组替换规则总数: ${Object.keys(groupRulesConfig.group_specific_rules[targetGroupId].rules).length}${conflictWarning}`);
        
        if (config.debugMode) {
          console.log(`[群组特定规则已添加] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 为群组 ${targetGroupId} 添加规则 '${oldWord}' -> '${newWord}'`);
        }
      } else {
        ctx.reply('❌ 保存群组规则配置时出错，请稍后重试。');
      }
    } else {
      // 添加全局规则
      // 检查是否已存在相同规则
      if (groupRulesConfig.global_rules[oldWord] === newWord) {
        return ctx.reply(`⚠️ 全局替换规则 '${oldWord}' -> '${newWord}' 已存在，无需重复添加。`);
      }
      
      // 添加或更新替换规则
      groupRulesConfig.global_rules[oldWord] = newWord;
      
      // 保存配置
      const saved = saveGroupRulesConfig(groupRulesConfig);
      
      if (saved) {
        // 更新运行时配置以保持兼容性
        config.textReplaceRules = groupRulesConfig.global_rules;
        
        ctx.reply(`✅ 全局替换规则已添加！\n\n'${oldWord}' 将被替换为 '${newWord}'\n全局替换规则总数: ${Object.keys(groupRulesConfig.global_rules).length}`);
        
        if (config.debugMode) {
          console.log(`[全局规则已添加] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 添加规则 '${oldWord}' -> '${newWord}'`);
        }
      } else {
        ctx.reply('❌ 保存群组规则配置时出错，请稍后重试。');
      }
    }
  } catch (error) {
    console.error('处理添加替换规则命令时出错:', error);
    ctx.reply('❌ 处理命令时出错，请稍后重试。');
  }
});

// /list_rules 命令 - 列出替换规则（支持显示全局规则和群组特定规则）
// 格式：/list_rules [global|group] [群组ID]
bot.command('list_rules', isAdmin, async (ctx) => {
  try {
    // 解析参数
    const args = ctx.message.text.split(' ');
    let ruleType = 'all'; // 默认显示所有规则
    let targetGroupId = null;
    
    if (args.length >= 2) {
      if (args[1].toLowerCase() === 'global' || args[1].toLowerCase() === 'group') {
        ruleType = args[1].toLowerCase();
        
        if (ruleType === 'group' && args.length >= 3 && args[2].startsWith('-')) {
          targetGroupId = args[2].trim();
          // 验证群组ID格式
          if (!/^-?\d+$/.test(targetGroupId)) {
            return ctx.reply('❌ 无效的群组ID！请输入正确的数字ID。');
          }
        }
      }
    }
    
    // 读取群组规则配置
    const groupRulesConfig = readGroupRulesConfig();
    
    // 根据ruleType选择要显示的规则
    let rulesToDisplay = {};
    let displayTitle = '所有替换规则';
    
    if (ruleType === 'global') {
      // 只显示全局规则
      rulesToDisplay = groupRulesConfig.global_rules;
      displayTitle = '全局替换规则';
    } else if (ruleType === 'group' && targetGroupId) {
      // 只显示指定群组的规则
      if (!groupRulesConfig.group_specific_rules[targetGroupId] || 
          !groupRulesConfig.group_specific_rules[targetGroupId].rules) {
        return ctx.reply(`📝 在群组 ${targetGroupId} 中没有配置任何文本替换规则。\n\n使用 /add_rule <旧词> <新词> ${targetGroupId} 添加该群组的替换规则。`);
      }
      rulesToDisplay = groupRulesConfig.group_specific_rules[targetGroupId].rules;
      displayTitle = `群组 ${targetGroupId} 的替换规则`;
    } else {
      // 显示所有规则（全局+所有群组特定规则）
      // 构建全局规则列表
      const globalRules = groupRulesConfig.global_rules;
      // 构建所有群组特定规则列表
      const allGroupRules = {};
      Object.keys(groupRulesConfig.group_specific_rules).forEach(groupId => {
        const groupRules = groupRulesConfig.group_specific_rules[groupId].rules;
        Object.keys(groupRules).forEach(oldWord => {
          allGroupRules[`${oldWord} (群组: ${groupId})`] = groupRules[oldWord];
        });
      });
      // 合并全局规则和群组特定规则
      rulesToDisplay = { ...globalRules, ...allGroupRules };
    }
    
    const ruleKeys = Object.keys(rulesToDisplay);
    
    if (ruleKeys.length === 0) {
      if (ruleType === 'group' && targetGroupId) {
        return ctx.reply(`📝 在群组 ${targetGroupId} 中没有配置任何文本替换规则。\n\n使用 /add_rule <旧词> <新词> ${targetGroupId} 添加该群组的替换规则。`);
      }
      return ctx.reply(`📝 当前没有配置任何${displayTitle}。\n\n使用 /add_rule <旧词> <新词> [群组ID] 添加替换规则。`);
    }
    
    // 分页显示规则
    const pageSize = 10; // 每页显示10条规则
    const pages = [];
    
    for (let i = 0; i < ruleKeys.length; i += pageSize) {
      const pageRules = ruleKeys.slice(i, i + pageSize);
      let pageContent = `🔄 ${displayTitle}列表 (共 ${ruleKeys.length} 条，第 ${Math.floor(i / pageSize) + 1}/${Math.ceil(ruleKeys.length / pageSize)} 页)\n\n`;
      
      pageRules.forEach((oldWord, index) => {
        const newWord = rulesToDisplay[oldWord];
        pageContent += `• '${oldWord}' 将被替换为 '${newWord}'\n`;
      });
      
      if (ruleKeys.length > pageSize) {
        pageContent += `\n💡 提示：当前显示第 ${Math.floor(i / pageSize) + 1} 页，共 ${Math.ceil(ruleKeys.length / pageSize)} 页。`;
      }
      
      pages.push(pageContent);
    }
    
    // 发送所有页面
    for (const page of pages) {
      await ctx.reply(page);
      // 添加短暂延迟，避免消息顺序混乱
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // 添加操作提示
    ctx.reply('\n操作命令：\n/add_rule <旧词> <新词> [群组ID] - 添加替换规则\n/remove_rule <旧词> [群组ID] - 删除替换规则\n/list_rules global - 只显示全局规则\n/list_rules group <群组ID> - 只显示特定群组的规则');
  } catch (error) {
    console.error('处理列出替换规则命令时出错:', error);
    ctx.reply('❌ 处理命令时出错，请稍后重试。');
  }
});

// /remove_rule 命令 - 移除替换规则
// 格式：/remove_rule <oldWord> [群组ID]
bot.command('remove_rule', isAdmin, async (ctx) => {
  try {
    // 解析参数
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      return ctx.reply('❌ 用法错误！请使用：/remove_rule <旧词> [群组ID]\n\n示例：\n- 删除全局规则：/remove_rule 你好\n- 删除群组特定规则：/remove_rule 你好 -1001234567890');
    }
    
    // 获取要删除的规则键
    const oldWord = args[1].trim();
    let targetGroupId = null;
    
    // 检查是否指定了群组ID（以-开头）
    if (args.length >= 3 && args[2].startsWith('-')) {
      targetGroupId = args[2].trim();
      // 验证群组ID格式
      if (!/^-?\d+$/.test(targetGroupId)) {
        return ctx.reply('❌ 无效的群组ID！请输入正确的数字ID。');
      }
    }
    
    // 验证参数
    if (!oldWord) {
      return ctx.reply('❌ 无效的参数！请指定要删除的旧词。');
    }
    
    // 读取群组规则配置
    const groupRulesConfig = readGroupRulesConfig();
    
    let ruleExists = false;
    let removedWord = '';
    let ruleType = '';
    
    if (targetGroupId) {
      // 检查群组特定规则
      if (!groupRulesConfig.group_specific_rules[targetGroupId] || 
          !groupRulesConfig.group_specific_rules[targetGroupId].rules[oldWord]) {
        return ctx.reply(`⚠️ 在群组 ${targetGroupId} 中未找到替换规则 '${oldWord}'，请确认旧词是否正确。`);
      }
      
      ruleExists = true;
      removedWord = groupRulesConfig.group_specific_rules[targetGroupId].rules[oldWord];
      ruleType = 'group';
    } else {
      // 检查全局规则
      if (!groupRulesConfig.global_rules[oldWord]) {
        // 尝试检查旧的规则文件以保持兼容性
        const oldRules = readReplacementRules();
        if (!oldRules[oldWord]) {
          return ctx.reply(`⚠️ 未找到全局替换规则 '${oldWord}'，请确认旧词是否正确。`);
        }
        // 如果在旧文件中找到，则标记为从旧文件迁移
        removedWord = oldRules[oldWord];
        ruleType = 'old_global';
      } else {
        ruleExists = true;
        removedWord = groupRulesConfig.global_rules[oldWord];
        ruleType = 'global';
      }
    }
    
    // 使用确认对话框
    ctx.session = ctx.session || {};
    ctx.session.tempData = ctx.session.tempData || {};
    ctx.session.tempData.removeRuleOldWord = oldWord;
    ctx.session.tempData.removeRuleNewWord = removedWord;
    ctx.session.tempData.removeRuleGroupId = targetGroupId;
    ctx.session.tempData.removeRuleType = ruleType;
    
    // 构建确认消息
    let confirmMessage = `⚠️ 确认删除替换规则？\n\n规则: '${oldWord}' -> '${removedWord}'`;
    if (targetGroupId) {
      confirmMessage += `\n目标群组: ${targetGroupId}`;
    }
    confirmMessage += '\n\n删除后无法恢复，确定要继续吗？';
    
    const message = await ctx.reply(confirmMessage, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ 确认删除', callback_data: `confirm_remove_rule` },
            { text: '❌ 取消', callback_data: `cancel_remove_rule` }
          ]
        ]
      }
    });
    
    // 保存消息ID以便后续处理
    ctx.session.tempData.confirmMessageId = message.message_id;
    
  } catch (error) {
    console.error('处理移除替换规则命令时出错:', error);
    ctx.reply('❌ 处理命令时出错，请稍后重试。');
  }
});

// 处理确认删除规则回调
bot.action('confirm_remove_rule', async (ctx) => {
  try {
    if (!ctx.session || !ctx.session.tempData || !ctx.session.tempData.removeRuleOldWord) {
      ctx.answerCbQuery('❌ 操作已过期，请重试');
      return;
    }
    
    const oldWord = ctx.session.tempData.removeRuleOldWord;
    const removedWord = ctx.session.tempData.removeRuleNewWord;
    const targetGroupId = ctx.session.tempData.removeRuleGroupId;
    const ruleType = ctx.session.tempData.removeRuleType || 'global';
    
    let saveResult = false;
    let remainingRulesCount = 0;
    let responseMessage = '';
    
    if (targetGroupId) {
      // 删除群组特定规则
      const groupRulesConfig = readGroupRulesConfig();
      
      if (groupRulesConfig.group_specific_rules[targetGroupId] && 
          groupRulesConfig.group_specific_rules[targetGroupId].rules[oldWord]) {
        // 移除规则
        delete groupRulesConfig.group_specific_rules[targetGroupId].rules[oldWord];
        
        // 保存配置
        saveResult = saveGroupRulesConfig(groupRulesConfig);
        
        if (saveResult) {
          remainingRulesCount = Object.keys(groupRulesConfig.group_specific_rules[targetGroupId].rules).length;
          responseMessage = `✅ 群组特定替换规则已移除！\n\n目标群组: ${targetGroupId}\n已删除规则: '${oldWord}' -> '${removedWord}'\n该群组剩余替换规则数量: ${remainingRulesCount}`;
          
          if (config.debugMode) {
            console.log(`[群组特定规则已移除] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 移除群组 ${targetGroupId} 的规则 '${oldWord}' -> '${removedWord}'`);
          }
        }
      }
    } else {
      if (ruleType === 'old_global') {
        // 从旧的规则文件中删除（保持兼容性）
        const oldRules = readReplacementRules();
        
        if (oldRules[oldWord]) {
          // 移除规则
          delete oldRules[oldWord];
          
          // 保存到文件
          saveResult = saveReplacementRules(oldRules);
          
          if (saveResult) {
            // 更新运行时配置
            config.textReplaceRules = oldRules;
            
            remainingRulesCount = Object.keys(oldRules).length;
            responseMessage = `✅ 全局替换规则已移除！\n\n已删除规则: '${oldWord}' -> '${removedWord}'\n剩余全局替换规则数量: ${remainingRulesCount}`;
            
            if (config.debugMode) {
              console.log(`[全局规则已移除] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 移除规则 '${oldWord}' -> '${removedWord}'`);
            }
          }
        }
      } else {
        // 删除全局规则
        const groupRulesConfig = readGroupRulesConfig();
        
        if (groupRulesConfig.global_rules[oldWord]) {
          // 移除规则
          delete groupRulesConfig.global_rules[oldWord];
          
          // 保存配置
          saveResult = saveGroupRulesConfig(groupRulesConfig);
          
          if (saveResult) {
            // 更新运行时配置以保持兼容性
            config.textReplaceRules = groupRulesConfig.global_rules;
            
            remainingRulesCount = Object.keys(groupRulesConfig.global_rules).length;
            responseMessage = `✅ 全局替换规则已移除！\n\n已删除规则: '${oldWord}' -> '${removedWord}'\n剩余全局替换规则数量: ${remainingRulesCount}`;
            
            if (config.debugMode) {
              console.log(`[全局规则已移除] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 移除规则 '${oldWord}' -> '${removedWord}'`);
            }
          }
        }
      }
    }
    
    // 删除临时数据
    delete ctx.session.tempData.removeRuleOldWord;
    delete ctx.session.tempData.removeRuleNewWord;
    delete ctx.session.tempData.removeRuleGroupId;
    delete ctx.session.tempData.removeRuleType;
    
    // 更新确认消息
    if (ctx.session.tempData.confirmMessageId) {
      try {
        await bot.telegram.deleteMessage(ctx.chat.id, ctx.session.tempData.confirmMessageId);
      } catch (error) {
        // 忽略删除失败的错误
      }
      delete ctx.session.tempData.confirmMessageId;
    }
    
    if (saveResult) {
      ctx.reply(responseMessage);
    } else {
      ctx.reply('❌ 保存替换规则时出错，请稍后重试。');
    }
  } catch (error) {
    console.error('确认删除规则时出错:', error);
    ctx.reply('❌ 处理命令时出错，请稍后重试。');
  }
});

// 处理取消删除规则回调
bot.action('cancel_remove_rule', async (ctx) => {
  try {
    // 删除临时数据
    if (ctx.session && ctx.session.tempData) {
      delete ctx.session.tempData.removeRuleOldWord;
      delete ctx.session.tempData.removeRuleNewWord;
      
      // 删除确认消息
      if (ctx.session.tempData.confirmMessageId) {
        try {
          await bot.telegram.deleteMessage(ctx.chat.id, ctx.session.tempData.confirmMessageId);
        } catch (error) {
          // 忽略删除失败的错误
        }
        delete ctx.session.tempData.confirmMessageId;
      }
    }
    
    ctx.answerCbQuery('已取消删除操作');
  } catch (error) {
    console.error('取消删除规则时出错:', error);
  }
});

// 示例管理命令

// /admin_status 命令 - 查看机器人详细状态
bot.command('admin_status', isAdmin, (ctx) => {
  const now = new Date();
  const uptime = process.uptime();
  const uptimeHours = Math.floor(uptime / 3600);
  const uptimeMinutes = Math.floor((uptime % 3600) / 60);
  const uptimeSeconds = Math.floor(uptime % 60);
  
  let statusMessage = `🤖 机器人状态信息\n\n`;
  statusMessage += `🗓️ 当前时间：${now.toLocaleString()}\n`;
  statusMessage += `⏱️ 运行时间：${uptimeHours}小时${uptimeMinutes}分钟${uptimeSeconds}秒\n`;
  statusMessage += `👥 当前用户：${ctx.from.first_name || ''} ${ctx.from.last_name || ''} (@${ctx.from.username})\n`;
  statusMessage += `🔑 用户ID：${ctx.from.id}\n`;
  statusMessage += `💬 当前聊天：${ctx.chat.type === 'private' ? '私聊' : ctx.chat.title || '未知'}\n`;
  statusMessage += `🆔 聊天ID：${ctx.chat.id}\n\n`;
  
  statusMessage += `⚙️ 配置信息：\n`;
  statusMessage += `- 源群组数量：${config.sourceChatIds.length}\n`;
  statusMessage += `- 目标群组数量：${config.targetChatIds.length}\n`;
  statusMessage += `- 管理员数量：${config.adminIds.length}\n`;
  statusMessage += `- 替换规则数量：${Object.keys(config.textReplaceRules).length}\n`;
  statusMessage += `- 调试模式：${config.debugMode ? '✅ 开启' : '❌ 关闭'}\n`;
  
  ctx.reply(statusMessage);
});

// /admin_debug 命令 - 切换调试模式
bot.command('admin_debug', isAdmin, (ctx) => {
  // 在运行时切换调试模式（注意：这只会影响当前运行实例，不会永久更改配置）
  config.debugMode = !config.debugMode;
  
  const debugStatus = config.debugMode ? '✅ 调试模式已开启' : '❌ 调试模式已关闭';
  
  ctx.reply(`${debugStatus}\n\n调试模式下将输出更详细的日志信息。`);
  
  if (config.debugMode) {
    console.log(`[调试模式已开启] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 开启`);
  } else {
    console.log(`[调试模式已关闭] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 关闭`);
  }
});

// /admin_list 命令 - 查看所有管理员ID
bot.command('admin_list', isAdmin, (ctx) => {
  if (config.adminIds.length === 0) {
    ctx.reply('当前未配置任何管理员。');
    return;
  }
  
  let adminList = `👑 管理员列表 (共 ${config.adminIds.length} 位)\n\n`;
  
  // 显示所有管理员ID
  config.adminIds.forEach((adminId, index) => {
    adminList += `${index + 1}. ${adminId}\n`;
  });
  
  adminList += `\n您的用户ID: ${ctx.from.id}\n`;
  adminList += `您${config.adminIds.includes(ctx.from.id.toString()) ? '是' : '不是'}管理员。`;
  
  ctx.reply(adminList);
});

// 处理转发消息获取群组ID
bot.on('message', async (ctx) => {
  // 如果用户正在等待群组ID，处理转发消息
  if (ctx.session && (ctx.session.expecting === 'source_group_forward' || ctx.session.expecting === 'target_group_forward')) {
    await handleForwardedMessage(ctx);
    return;
  }
  
  // 如果用户正在等待文本输入，处理文本输入
  if (ctx.session && (ctx.session.expecting === 'pin_on_group_id' || ctx.session.expecting === 'pin_off_group_id')) {
    await handleTextInput(ctx);
    return;
  }
  
  // 检查监控是否开启
  if (!monitoringEnabled) {
    if (config.debugMode) {
      console.log('监控已关闭，忽略消息');
    }
    return;
  }
  
  try {
    // 获取当前消息的聊天ID
    const currentChatId = ctx.chat.id.toString();
    
    // 检查当前消息是否来自机器人自己（避免循环转发）
    if (ctx.message.from.is_bot) {
      if (config.debugMode) {
        console.log('忽略机器人自己的消息');
      }
      return;
    }
    
    // 检查当前聊天是否为配置的源群组之一
    if (config.sourceChatIds.includes(currentChatId)) {
      if (config.debugMode) {
        console.log(`收到来自源群组 ${currentChatId} 的消息，消息ID: ${ctx.message.message_id}`);
      }
      
      // 如果有目标群组，则转发消息
      if (config.targetChatIds.length > 0) {
        // 对每个目标群组进行处理
        for (const targetChatId of config.targetChatIds) {
          try {
            // 检查消息是否为文本消息
              if (ctx.message.text) {
                // 获取该目标群组的有效规则（合并全局规则和群组特定规则）
                const effectiveRules = await getEffectiveRules(targetChatId);
                
                // 应用文本替换规则（大小写不敏感）
                let processedText = ctx.message.text;
                
                if (effectiveRules && Object.keys(effectiveRules).length > 0) {
                  // 遍历替换规则映射表
                  for (const [oldWord, newWord] of Object.entries(effectiveRules)) {
                    // 创建大小写不敏感的正则表达式
                    const regex = new RegExp(oldWord, 'gi');
                    // 执行全局替换
                    processedText = processedText.replace(regex, newWord);
                  }
                }
              
              // 准备发送选项
              const sendOptions = {
                disable_notification: false
              };
              
              // 如果原消息有回复关系，尝试保持
              if (ctx.message.reply_to_message) {
                if (config.debugMode) {
                  console.log('原消息有回复关系');
                }
              }
              
              // 使用sendMessage发送替换后的文本
              const sentMessage = await ctx.telegram.sendMessage(
                targetChatId,
                processedText,
                sendOptions
              );
              
              if (config.debugMode) {
                console.log(`成功发送替换后的文本消息：从 ${currentChatId} -> ${targetChatId}`);
                if (processedText !== ctx.message.text) {
                  console.log(`文本替换: "${ctx.message.text}" -> "${processedText}"`);
                }
              }
              
              // 检查是否需要置顶消息
              if (pinSettings[targetChatId]) {
                // 先检查权限（防止在运行时权限被移除）
                const permissionResult = await checkPinPermissions(targetChatId);
                if (permissionResult.hasPermission) {
                  // 使用带重试机制的置顶函数
                  await pinMessageWithRetry(ctx, targetChatId, sentMessage.message_id);
                } else {
                  const permissionError = `🚨 置顶权限已失效：Bot在群组 ${targetChatId} 不再拥有置顶权限`;
                  console.error(permissionError);
                  notifyAdmins(permissionError);
                  
                  // 自动关闭该群组的置顶功能，避免持续错误
                  pinSettings[targetChatId] = false;
                  savePinConfig(pinSettings);
                }
              }
            } else {
              // 非文本消息（图片、文件等），直接转发原消息
              const forwardedMessage = await ctx.telegram.forwardMessage(
                targetChatId,  // 目标聊天ID
                currentChatId, // 源聊天ID
                ctx.message.message_id, // 消息ID
                {
                  disable_notification: false
                }
              );
              
              if (config.debugMode) {
                console.log(`成功转发非文本消息：从 ${currentChatId} -> ${targetChatId}`);
              }
              
              // 检查是否需要置顶消息
              if (pinSettings[targetChatId]) {
                // 先检查权限（防止在运行时权限被移除）
                const permissionResult = await checkPinPermissions(targetChatId);
                if (permissionResult.hasPermission) {
                  // 使用带重试机制的置顶函数
                  await pinMessageWithRetry(ctx, targetChatId, forwardedMessage.message_id);
                } else {
                  const permissionError = `🚨 置顶权限已失效：Bot在群组 ${targetChatId} 不再拥有置顶权限`;
                  console.error(permissionError);
                  notifyAdmins(permissionError);
                  
                  // 自动关闭该群组的置顶功能，避免持续错误
                  pinSettings[targetChatId] = false;
                  savePinConfig(pinSettings);
                }
              }
            }
          } catch (messageError) {
            // 捕获并处理转发过程中的错误
            const errorMsg = `处理消息到目标群组 ${targetChatId} 时出错: ${messageError.message}`;
            console.error(errorMsg);
            
            // 检查是否是权限错误（Bot可能被踢出群组）
            if (messageError.response?.error_code === 403) {
              const permissionError = `🚨 错误：无法向群组 ${targetChatId} 发送消息，可能是Bot被踢出群组或没有足够权限。`;
              console.error(permissionError);
              // 通知管理员
              notifyAdmins(permissionError);
            } else if (messageError.response?.error_code === 400) {
              // 无效的消息或参数错误
              const invalidMsgError = `🚨 错误：向群组 ${targetChatId} 发送消息失败，无效的消息或参数。`;
              console.error(invalidMsgError);
              // 通知管理员
              notifyAdmins(invalidMsgError);
            }
          }
        }
      } else {
        const warnMsg = '警告：目标群组ID未设置，无法转发消息';
        console.warn(warnMsg);
        // 通知管理员
        notifyAdmins(warnMsg);
      }
    }
  } catch (error) {
    console.error('处理消息时出错:', error);
    // 通知管理员
    notifyAdmins(`❌ 处理消息时发生严重错误: ${error.message}`);
  }
});

// 检查Bot在指定群组的置顶权限
async function checkPinPermissions(chatId) {
  try {
    // 获取聊天信息
    const chat = await bot.telegram.getChat(chatId);
    
    // 获取Bot在该群组的成员信息
    const member = await bot.telegram.getChatMember(chatId, bot.botInfo.id);
    
    // 检查是否是管理员且有置顶权限
    const hasPermission = member.status === 'administrator' && 
                         (member.can_pin_messages || member.can_promote_members || member.is_anonymous_admin);
    
    return {
      hasPermission,
      isAdmin: member.status === 'administrator' || member.status === 'creator',
      canPinMessages: member.can_pin_messages
    };
  } catch (error) {
    console.error(`检查群组 ${chatId} 的置顶权限时出错:`, error);
    
    // 处理常见错误情况
    if (error.response?.error_code === 403) {
      return { hasPermission: false, error: 'Bot被踢出群组或无访问权限' };
    } else if (error.response?.error_code === 400) {
      return { hasPermission: false, error: '无效的群组ID或参数' };
    }
    
    return { hasPermission: false, error: '未知错误' };
  }
}

// 带重试机制的消息置顶函数
async function pinMessageWithRetry(ctx, chatId, messageId, maxRetries = 2) {
  let retries = 0;
  
  while (retries <= maxRetries) {
    try {
      await ctx.telegram.pinChatMessage(
        chatId,
        messageId,
        {
          disable_notification: true // 置顶时不发送通知
        }
      );
      
      console.log(`✅ 消息已置顶于群组 ${chatId}`);
      return true;
    } catch (error) {
      retries++;
      
      if (retries > maxRetries) {
        // 达到最大重试次数，确认为永久性错误
        const errorMessage = `❌ 无法在群组 ${chatId} 置顶消息：${error.message}`;
        console.error(errorMessage);
        // 通知管理员
        notifyAdmins(errorMessage);
        return false;
      }
      
      // 记录重试信息
      console.log(`⚠️ 在群组 ${chatId} 置顶消息失败，正在重试 (${retries}/${maxRetries})...`);
      
      // 短暂延迟后重试
      await new Promise(resolve => setTimeout(resolve, 1000 * retries));
    }
  }
  
  return false;
}

// 通知管理员函数
async function notifyAdmins(message) {
  if (!config.adminIds || config.adminIds.length === 0) {
    return; // 没有配置管理员，不发送通知
  }
  
  for (const adminId of config.adminIds) {
    try {
      await bot.telegram.sendMessage(adminId, message, {
        parse_mode: 'HTML',
        disable_notification: true
      });
    } catch (error) {
      console.error(`无法向管理员 ${adminId} 发送通知:`, error);
      // 继续尝试通知其他管理员
    }
  }
}

// 处理主菜单回调

// 返回主页
const handleBackToMain = (ctx) => {
  // 重置用户的菜单层级
  if (ctx.session) {
    ctx.session.menuLevel = 'main';
  }
  
  const welcomeMessage = `🏠 主页\n\n欢迎使用 ${config.botName}！\n\n这是一个群组消息转发机器人，支持文本替换和置顶功能。\n\n请从下方菜单选择您需要的操作：`;
  ctx.editMessageText(welcomeMessage, getMainMenuKeyboard());
};

// 显示状态看板
const showStatusDashboard = (ctx) => {
  const now = new Date();
  const uptime = process.uptime();
  const uptimeHours = Math.floor(uptime / 3600);
  const uptimeMinutes = Math.floor((uptime % 3600) / 60);
  const uptimeSeconds = Math.floor(uptime % 60);
  
  // 获取源群组和目标群组信息
  const sourceGroups = readSourceGroups();
  const totalSourceGroups = sourceGroups.length;
  const enabledSourceGroups = sourceGroups.filter(g => g.enabled).length;
  
  // 获取置顶配置信息
  const totalPinConfigs = Object.keys(pinSettings).length;
  const enabledPinConfigs = Object.values(pinSettings).filter(s => s.enabled).length;
  
  let statusMessage = `🏠 主页 > 📋 状态看板\n\n`;
  statusMessage += `🗓️ 当前时间：${now.toLocaleString()}\n`;
  statusMessage += `⏱️ 运行时间：${uptimeHours}小时${uptimeMinutes}分钟${uptimeSeconds}秒\n\n`;
  
  statusMessage += `⚙️ 配置概览：\n`;
  statusMessage += `- 源群组总数：${totalSourceGroups}\n`;
  statusMessage += `- 已启用的源群组：${enabledSourceGroups}\n`;
  statusMessage += `- 目标群组数量：${config.targetChatIds.length}\n`;
  statusMessage += `- 替换规则数量：${Object.keys(config.textReplaceRules).length}\n`;
  statusMessage += `- 置顶配置数量：${totalPinConfigs}\n`;
  statusMessage += `- 已启用的置顶配置：${enabledPinConfigs}\n`;
  statusMessage += `- 管理员数量：${config.adminIds.length}\n\n`;
  
  statusMessage += `🔄 系统状态：\n`;
  statusMessage += `- 监控状态：${monitoringEnabled ? '✅ 已开启' : '❌ 已关闭'}\n`;
  statusMessage += `- 调试模式：${config.debugMode ? '✅ 已开启' : '❌ 已关闭'}`;
  
  // 更新消息并跟踪界面
  if (ctx.callbackQuery && ctx.callbackQuery.message) {
    const screenKey = `${ctx.from.id}_status_dashboard`;
    activeScreens.set(screenKey, {
      chatId: ctx.chat.id,
      messageId: ctx.callbackQuery.message.message_id,
      type: 'status_dashboard'
    });
  }
  
  ctx.editMessageText(statusMessage, getBackToMainMenuButton());
};

// 显示配置管理二级菜单
const showConfigMenu = (ctx) => {
  const isAdmin = config.adminIds.length === 0 || config.adminIds.includes(ctx.from.id.toString());
  
  if (!isAdmin) {
    ctx.editMessageText(`您当前不是管理员，无法查看或修改配置。\n\n💡 提示：请联系管理员获取权限。`, getBackToMainMenuButton());
    return;
  }
  
  // 记录用户的菜单层级
  if (ctx.session) {
    ctx.session.menuLevel = 'config';
  }
  
  const configMenuMessage = `🏠 主页 > ⚙️ 配置管理\n\n请选择您需要管理的配置类型：`;
  
  ctx.editMessageText(configMenuMessage, getConfigMenuKeyboard());
};

// 显示群组管理界面
const showGroupManagement = (ctx) => {
  // 记录用户的菜单层级
  if (ctx.session) {
    ctx.session.menuLevel = 'group_management';
  }
  
  const groupManagementMessage = `🏠 主页 > ⚙️ 配置管理 > 🎯 群组设置\n\n请选择您需要执行的操作：`;
  
  ctx.editMessageText(groupManagementMessage, getGroupManagementKeyboard());
};

// 显示替换规则管理界面
const showRuleManagement = (ctx) => {
  // 记录用户的菜单层级
  if (ctx.session) {
    ctx.session.menuLevel = 'rule_management';
  }
  
  const ruleManagementMessage = `🏠 主页 > ⚙️ 配置管理 > 📝 替换规则\n\n请选择您需要执行的操作：`;
  
  ctx.editMessageText(ruleManagementMessage, getRuleManagementKeyboard());
};

// 显示置顶功能管理界面
const showPinManagement = (ctx) => {
  // 记录用户的菜单层级
  if (ctx.session) {
    ctx.session.menuLevel = 'pin_management';
  }
  
  const pinManagementMessage = `🏠 主页 > ⚙️ 配置管理 > 📌 置顶功能\n\n请选择您需要执行的操作：`;
  
  ctx.editMessageText(pinManagementMessage, getPinManagementKeyboard());
};

// 处理添加源群组
const handleAddSourceGroup = (ctx) => {
  // 进入添加群组场景
  ctx.editMessageText('正在进入添加群组模式...');
  ctx.scene.enter('ADD_GROUP_SCENE');
};

// 处理设置目标群组
const handleSetTargetGroup = (ctx) => {
  // 进入添加群组场景
  ctx.editMessageText('正在进入添加群组模式...');
  ctx.scene.enter('ADD_GROUP_SCENE');
};

// 处理查看源群组列表
const handleListSourceGroups = async (ctx) => {
  try {
    const sourceGroups = readSourceGroups();
    
    if (sourceGroups.length === 0) {
      const message = `🏠 主页 > ⚙️ 配置管理 > 🎯 群组设置 > 📋 源群组列表\n\n当前没有配置任何源群组。\n\n请使用"添加源群组"功能添加群组。`;
      ctx.editMessageText(message, getGroupManagementKeyboard());
      return;
    }
    
    let listMessage = `🏠 主页 > ⚙️ 配置管理 > 🎯 群组设置 > 📋 源群组列表 (共 ${sourceGroups.length} 个)\n\n`;
    
    sourceGroups.forEach((group, index) => {
      const statusEmoji = group.enabled ? '✅' : '❌';
      listMessage += `${index + 1}. ID: ${group.id} ${statusEmoji} ${group.enabled ? '已启用' : '已禁用'}\n`;
    });
    
    listMessage += `\n💡 提示：点击"添加源群组"按钮添加新的源群组。`;
    
    // 更新消息并跟踪界面
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      const screenKey = `${ctx.from.id}_source_groups_list`;
      activeScreens.set(screenKey, {
        chatId: ctx.chat.id,
        messageId: ctx.callbackQuery.message.message_id,
        type: 'source_groups_list'
      });
    }
    
    ctx.editMessageText(listMessage, getGroupManagementKeyboard());
  } catch (error) {
    console.error('处理查看源群组列表时出错:', error);
    ctx.editMessageText('❌ 处理请求时出错，请稍后重试。', getGroupManagementKeyboard());
  }
};

// 处理查看目标群组列表
const handleListTargetGroups = async (ctx) => {
  try {
    const targetGroup = readTargetGroup();
    
    if (!targetGroup) {
      const message = `🏠 主页 > ⚙️ 配置管理 > 🎯 群组设置 > 🎯 目标群组列表\n\n当前没有设置目标群组。\n\n请使用"设置目标群组"功能设置目标群组。`;
      ctx.editMessageText(message, getGroupManagementKeyboard());
      return;
    }
    
    const listMessage = `🏠 主页 > ⚙️ 配置管理 > 🎯 群组设置 > 🎯 目标群组列表\n\n当前设置的目标群组：\nID: ${targetGroup}\n\n💡 提示：点击"设置目标群组"按钮修改目标群组。`;
    
    // 更新消息并跟踪界面
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      const screenKey = `${ctx.from.id}_target_groups_list`;
      activeScreens.set(screenKey, {
        chatId: ctx.chat.id,
        messageId: ctx.callbackQuery.message.message_id,
        type: 'target_groups_list'
      });
    }
    
    ctx.editMessageText(listMessage, getGroupManagementKeyboard());
  } catch (error) {
    console.error('处理查看目标群组列表时出错:', error);
    ctx.editMessageText('❌ 处理请求时出错，请稍后重试。', getGroupManagementKeyboard());
  }
};

// 处理添加替换规则
const handleAddReplacementRule = (ctx) => {
  // 进入添加替换规则场景
  ctx.editMessageText('正在进入添加替换规则模式...');
  ctx.scene.enter('ADD_RULE_SCENE');
};

// 处理替换规则分页和类型切换
function setupReplacementRulesPagination() {
  // 处理替换规则分页回调
  bot.action(/^replacement_rules_page_\d+$/, async (ctx) => {
    try {
      // 解析页码
      const callbackData = ctx.callbackQuery.data;
      const page = parseInt(callbackData.replace('replacement_rules_page_', ''));
      
      if (isNaN(page)) {
        ctx.answerCbQuery('❌ 无效的页码');
        return;
      }
      
      // 使用按钮加载状态
      const buttonKey = startButtonLoading(ctx, callbackData);
      
      // 显示对应页的规则列表
      await handleViewReplacementRules(ctx, page);
      
      // 结束按钮加载状态
      endButtonLoading(buttonKey);
      
      ctx.answerCbQuery(`已显示第 ${page + 1} 页`);
    } catch (error) {
      console.error('处理替换规则分页时出错:', error);
      ctx.answerCbQuery('❌ 处理分页时出错，请重试');
    }
  });
  
  // 处理全局规则分页回调
  bot.action(/^global_rules_page_\d+$/, async (ctx) => {
    try {
      // 解析页码
      const callbackData = ctx.callbackQuery.data;
      const page = parseInt(callbackData.replace('global_rules_page_', ''));
      
      if (isNaN(page)) {
        ctx.answerCbQuery('❌ 无效的页码');
        return;
      }
      
      // 使用按钮加载状态
      const buttonKey = startButtonLoading(ctx, callbackData);
      
      // 显示对应页的全局规则列表
      await handleViewReplacementRules(ctx, page, 'global');
      
      // 结束按钮加载状态
      endButtonLoading(buttonKey);
      
      ctx.answerCbQuery(`已显示第 ${page + 1} 页`);
    } catch (error) {
      console.error('处理全局规则分页时出错:', error);
      ctx.answerCbQuery('❌ 处理分页时出错，请重试');
    }
  });
  
  // 处理所有规则分页回调
  bot.action(/^all_rules_page_\d+$/, async (ctx) => {
    try {
      // 解析页码
      const callbackData = ctx.callbackQuery.data;
      const page = parseInt(callbackData.replace('all_rules_page_', ''));
      
      if (isNaN(page)) {
        ctx.answerCbQuery('❌ 无效的页码');
        return;
      }
      
      // 使用按钮加载状态
      const buttonKey = startButtonLoading(ctx, callbackData);
      
      // 显示对应页的所有规则列表
      await handleViewReplacementRules(ctx, page, 'all');
      
      // 结束按钮加载状态
      endButtonLoading(buttonKey);
      
      ctx.answerCbQuery(`已显示第 ${page + 1} 页`);
    } catch (error) {
      console.error('处理所有规则分页时出错:', error);
      ctx.answerCbQuery('❌ 处理分页时出错，请重试');
    }
  });
  
  // 处理切换到全局规则
  bot.action('view_global_rules', async (ctx) => {
    try {
      // 使用按钮加载状态
      const buttonKey = startButtonLoading(ctx, 'view_global_rules');
      
      // 显示全局规则列表
      await handleViewReplacementRules(ctx, 0, 'global');
      
      // 结束按钮加载状态
      endButtonLoading(buttonKey);
      
      ctx.answerCbQuery('已切换到全局规则列表');
    } catch (error) {
      console.error('切换到全局规则时出错:', error);
      ctx.answerCbQuery('❌ 切换失败，请重试');
    }
  });
  
  // 处理切换到所有规则
  bot.action('view_all_rules', async (ctx) => {
    try {
      // 使用按钮加载状态
      const buttonKey = startButtonLoading(ctx, 'view_all_rules');
      
      // 显示所有规则列表
      await handleViewReplacementRules(ctx, 0, 'all');
      
      // 结束按钮加载状态
      endButtonLoading(buttonKey);
      
      ctx.answerCbQuery('已切换到所有规则列表');
    } catch (error) {
      console.error('切换到所有规则时出错:', error);
      ctx.answerCbQuery('❌ 切换失败，请重试');
    }
  });
}

// 获取群组状态图标和说明
const getGroupStatusInfo = (groupSettings) => {
  const isEnabled = groupSettings.enabled || false;
  const inheritGlobal = groupSettings.inherit_global !== false; // 默认继承
  const hasSpecificRules = Object.keys(groupSettings.rules || {}).length > 0;
  
  // 根据不同状态返回不同的图标和说明
  if (!isEnabled) {
    return { icon: '🔴', status: '完全禁用规则' };
  } else if (hasSpecificRules && inheritGlobal) {
    return { icon: '🟢', status: '启用且使用专属规则+全局规则' };
  } else if (!hasSpecificRules && inheritGlobal) {
    return { icon: '🔵', status: '启用且仅用全局规则' };
  } else if (hasSpecificRules && !inheritGlobal) {
    return { icon: '🟠', status: '启用但禁用全局规则继承' };
  }
  
  return { icon: '🔵', status: '启用' };
};

// 获取生效规则数量
const getEffectiveRuleCount = async (groupId) => {
  try {
    const effectiveRules = await getEffectiveRules(groupId);
    return effectiveRules ? Object.keys(effectiveRules).length : 0;
  } catch (error) {
    console.error('获取生效规则数量时出错:', error);
    return 0;
  }
};

// 显示群组规则设置界面
const showGroupRulesSettings = async (ctx) => {
  try {
    // 记录用户的菜单层级
    if (ctx.session) {
      ctx.session.menuLevel = 'group_rules_settings';
    }
    
    // 使用按钮加载状态
    const buttonKey = startButtonLoading(ctx, 'group_rules_settings');
    
    // 读取群组规则配置
    const groupRulesConfig = readGroupRulesConfig();
    
    // 获取所有配置了规则的群组ID
    let configuredGroups = Object.keys(groupRulesConfig.group_specific_rules);
    
    // 按优先级排序（如果有排序信息）
    // 这里简单按照添加顺序显示，实际项目中可以从配置中读取优先级信息
    
    // 构建群组列表消息
    let message = `🏠 主页 > ⚙️ 配置管理 > 📝 替换规则 > 👥 群组规则设置\n\n已配置规则的群组列表：\n\n`;
    
    // 创建群组规则设置键盘
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '➕ 添加群组规则', callback_data: 'add_new_group_rule' }
          ],
          [
            { text: '🔙 返回替换规则管理', callback_data: 'rule_management' }
          ]
        ]
      }
    };
    
    if (configuredGroups.length === 0) {
      message += `📝 当前没有为任何群组配置特定规则。\n\n请使用下方按钮添加群组规则。`;
    } else {
      // 为每个配置的群组生成一行显示
      for (let i = 0; i < configuredGroups.length; i++) {
        const groupId = configuredGroups[i];
        const groupSettings = groupRulesConfig.group_specific_rules[groupId];
        const isEnabled = groupSettings.enabled || false;
        const inheritGlobal = groupSettings.inherit_global !== false;
        const specificRuleCount = Object.keys(groupSettings.rules || {}).length;
        const { icon, status } = getGroupStatusInfo(groupSettings);
        
        // 获取生效规则数量
        const effectiveRuleCount = await getEffectiveRuleCount(groupId);
        
        message += `${i + 1}. ${icon} 群组ID: ${groupId}\n`;
        message += `   • 状态: ${status}\n`;
        message += `   • 专属规则数量: ${specificRuleCount}\n`;
        message += `   • 生效规则数量: ${effectiveRuleCount}\n`;
        
        // 智能提示：当某个群组长时间没有专属规则时提示
        if (isEnabled && specificRuleCount === 0 && inheritGlobal) {
          message += `   💡 建议为这个群组添加特定规则，以实现更精细的控制。\n`;
        }
        
        message += '\n';
        
        // 为每个群组添加快速操作按钮
        keyboard.reply_markup.inline_keyboard.unshift([
          {
            text: `${isEnabled ? '❌ 禁用' : '✅ 启用'}`, 
            callback_data: `quick_toggle:${groupId}`
          },
          {
            text: `${inheritGlobal ? '🌐 禁用继承' : '🌐 启用继承'}`, 
            callback_data: `quick_toggle_inherit:${groupId}`
          },
          {
            text: `📋 查看生效(${effectiveRuleCount})`, 
            callback_data: `quick_view_effective:${groupId}`
          },
          {
            text: `🔧 管理`, 
            callback_data: `manage_group_rules:${groupId}`
          }
        ]);
      }
      
      // 添加拖拽排序提示
      message += `💡 提示：可以通过拖拽调整群组优先级，优先级高的群组会先显示。`;
    }
    
    // 如果有配置的群组，添加批量操作按钮
    if (configuredGroups.length > 0) {
      keyboard.reply_markup.inline_keyboard.unshift([
        { text: '📋 查看所有生效规则', callback_data: 'view_all_effective_rules' }
      ]);
      keyboard.reply_markup.inline_keyboard.unshift([
        { text: '✅ 批量启用规则', callback_data: 'batch_enable_rules' }
      ]);
      keyboard.reply_markup.inline_keyboard.unshift([
        { text: '❌ 批量禁用规则', callback_data: 'batch_disable_rules' }
      ]);
      keyboard.reply_markup.inline_keyboard.unshift([
        { text: '📥 导出群组配置', callback_data: 'export_group_config' },
        { text: '📤 导入群组配置', callback_data: 'import_group_config' }
      ]);
    }
    
    // 更新消息
    ctx.editMessageText(message, keyboard);
    
    // 结束按钮加载状态
    endButtonLoading(buttonKey);
    
    // 更新消息并跟踪界面
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      const screenKey = `${ctx.from.id}_group_rules_settings`;
      activeScreens.set(screenKey, {
        chatId: ctx.chat.id,
        messageId: ctx.callbackQuery.message.message_id,
        type: 'group_rules_settings'
      });
    }
  } catch (error) {
    console.error('显示群组规则设置时出错:', error);
    ctx.editMessageText('❌ 处理请求时出错，请稍后重试。', getRuleManagementKeyboard());
  }
};

// 显示群组规则详情界面
const showGroupRuleDetails = async (ctx, groupId) => {
  try {
    // 记录用户的菜单层级
    if (ctx.session) {
      ctx.session.menuLevel = 'group_rule_details';
      ctx.session.currentGroupId = groupId;
    }
    
    // 使用按钮加载状态
    const buttonKey = startButtonLoading(ctx, `manage_group_rules:${groupId}`);
    
    // 读取群组规则配置
    const groupRulesConfig = readGroupRulesConfig();
    
    // 获取该群组的规则设置
    const groupSettings = groupRulesConfig.group_specific_rules[groupId] || {
      enabled: true,
      inherit_global: true,
      rules: {}
    };
    
    const isEnabled = groupSettings.enabled || false;
    const inheritGlobal = groupSettings.inherit_global !== false; // 默认继承
    const ruleCount = Object.keys(groupSettings.rules || {}).length;
    
    // 构建群组详情消息
    let message = `🏠 主页 > ⚙️ 配置管理 > 📝 替换规则 > 👥 群组规则设置 > 🔧 群组规则详情\n\n`;
    message += `群组ID: ${groupId}\n`;
    message += `状态: ${isEnabled ? '✅ 启用' : '❌ 禁用'}\n`;
    message += `继承全局规则: ${inheritGlobal ? '✅ 是' : '❌ 否'}\n`;
    message += `专属规则数量: ${ruleCount}\n\n`;
    message += `请选择您需要执行的操作：`;
    
    // 创建群组详情键盘
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '⚙️ 启用/禁用规则', callback_data: `toggle_group_rules:${groupId}` }
          ],
          [
            { text: '🌐 继承全局规则', callback_data: `toggle_inherit_global:${groupId}` }
          ],
          [
            { text: '🔧 管理专属规则', callback_data: `manage_group_specific_rules:${groupId}` }
          ],
          [
            { text: '📋 查看生效规则', callback_data: `view_effective_rules:${groupId}` }
          ],
          [
            { text: '🧪 测试规则', callback_data: `test_rules:${groupId}` }
          ],
          [
            { text: '🔙 返回群组规则设置', callback_data: 'group_rules_settings' }
          ]
        ]
      }
    };
    
    // 更新消息
    ctx.editMessageText(message, keyboard);
    
    // 结束按钮加载状态
    endButtonLoading(buttonKey);
    
    // 更新消息并跟踪界面
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      const screenKey = `${ctx.from.id}_group_rule_details_${groupId}`;
      activeScreens.set(screenKey, {
        chatId: ctx.chat.id,
        messageId: ctx.callbackQuery.message.message_id,
        type: 'group_rule_details'
      });
    }
  } catch (error) {
    console.error('显示群组规则详情时出错:', error);
    ctx.editMessageText('❌ 处理请求时出错，请稍后重试。', getRuleManagementKeyboard());
  }
};

// 处理查看替换规则
const handleViewReplacementRules = async (ctx, page = 0, ruleType = 'global') => {
  try {
    // 读取群组规则配置
    const groupRulesConfig = readGroupRulesConfig();
    
    let rulesToDisplay = {};
    let displayTitle = '替换规则';
    let listType = 'replacement_rules'; // 用于分页状态管理
    
    // 根据ruleType选择要显示的规则
    if (ruleType === 'global') {
      // 只显示全局规则
      rulesToDisplay = groupRulesConfig.global_rules;
      displayTitle = '全局替换规则';
      listType = 'global_rules';
    } else if (ruleType === 'all') {
      // 显示所有规则（全局+所有群组特定规则）
      // 构建全局规则列表
      const globalRules = groupRulesConfig.global_rules;
      // 构建所有群组特定规则列表
      const allGroupRules = {};
      Object.keys(groupRulesConfig.group_specific_rules).forEach(groupId => {
        const groupRules = groupRulesConfig.group_specific_rules[groupId].rules;
        Object.keys(groupRules).forEach(oldWord => {
          allGroupRules[`${oldWord} (群组: ${groupId})`] = groupRules[oldWord];
        });
      });
      // 合并全局规则和群组特定规则
      rulesToDisplay = { ...globalRules, ...allGroupRules };
      displayTitle = '所有替换规则';
      listType = 'all_rules';
    }
    
    const ruleKeys = Object.keys(rulesToDisplay);
    
    if (ruleKeys.length === 0) {
      const message = `🏠 主页 > ⚙️ 配置管理 > 📝 替换规则 > 📝 ${displayTitle}列表\n\n当前没有配置任何${displayTitle.toLowerCase()}。\n\n请使用"添加替换规则"功能添加规则。`;
      ctx.editMessageText(message, getRuleManagementKeyboard());
      return;
    }
    
    // 获取或设置当前页码
    let currentPage;
    if (page === undefined) {
      const paginationState = getPaginationState(ctx.from.id, listType);
      currentPage = paginationState.currentPage;
    } else {
      currentPage = page;
      setPaginationState(ctx.from.id, listType, { currentPage });
    }
    
    // 计算总页数
    const totalPages = Math.ceil(ruleKeys.length / ITEMS_PER_PAGE);
    
    // 确保当前页有效
    if (currentPage < 0) currentPage = 0;
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    
    // 获取当前页的规则
    const startIndex = currentPage * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const displayRules = ruleKeys.slice(startIndex, endIndex);
    
    // 构建规则列表消息
    let ruleMessage = `🏠 主页 > ⚙️ 配置管理 > 📝 替换规则 > 📝 ${displayTitle}列表 (共 ${ruleKeys.length} 条，第 ${currentPage + 1}/${totalPages} 页)\n\n`;
    
    displayRules.forEach((oldWord, index) => {
      const newWord = rulesToDisplay[oldWord];
      const itemNumber = startIndex + index + 1;
      ruleMessage += `${itemNumber}. '${oldWord}' → '${newWord}'\n`;
    });
    
    // 创建分页键盘
    const paginationKeyboard = {
      reply_markup: {
        inline_keyboard: []
      }
    };
    
    // 添加分页按钮
    const paginationButtons = [];
    if (currentPage > 0) {
      paginationButtons.push({ text: '⬅️ 上一页', callback_data: `${listType}_page_${currentPage - 1}` });
    }
    
    if (currentPage < totalPages - 1) {
      paginationButtons.push({ text: '下一页 ➡️', callback_data: `${listType}_page_${currentPage + 1}` });
    }
    
    if (paginationButtons.length > 0) {
      paginationKeyboard.reply_markup.inline_keyboard.push(paginationButtons);
    }
    
    // 添加规则类型切换按钮
    const typeButtons = [];
    if (ruleType !== 'global') {
      typeButtons.push({ text: '🌍 显示全局规则', callback_data: `view_global_rules` });
    }
    if (ruleType !== 'all') {
      typeButtons.push({ text: '📋 显示所有规则', callback_data: `view_all_rules` });
    }
    if (typeButtons.length > 0) {
      paginationKeyboard.reply_markup.inline_keyboard.push(typeButtons);
    }
    
    // 添加返回按钮
    paginationKeyboard.reply_markup.inline_keyboard.push([
      { text: '🔙 返回替换规则管理', callback_data: 'rule_management' }
    ]);
    
    // 更新消息并跟踪界面
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      const screenKey = `${ctx.from.id}_${listType}_list`;
      activeScreens.set(screenKey, {
        chatId: ctx.chat.id,
        messageId: ctx.callbackQuery.message.message_id,
        type: `${listType}_list`
      });
    }
    
    ctx.editMessageText(ruleMessage, paginationKeyboard);
  } catch (error) {
    console.error('处理查看替换规则时出错:', error);
    ctx.editMessageText('❌ 处理请求时出错，请稍后重试。', getRuleManagementKeyboard());
  }
};



// 处理转发消息获取群组ID
const handleForwardedMessage = async (ctx) => {
  // 检查用户是否在等待群组ID
  if (!ctx.session || !ctx.session.expecting) {
    return;
  }
  
  try {
    const { expecting } = ctx.session;
    
    // 检查是否是转发的消息
    if (!ctx.message.forward_from_chat) {
      ctx.reply('请转发一条来自目标群组的消息，而不是直接发送消息。');
      return;
    }
    
    const chatId = ctx.message.forward_from_chat.id.toString();
    const chatTitle = ctx.message.forward_from_chat.title;
    
    if (expecting === 'source_group_forward') {
      // 添加源群组
      const sourceGroups = readSourceGroups();
      
      // 检查群组是否已存在
      if (sourceGroups.some(group => group.id === chatId)) {
        ctx.reply(`⚠️ 群组 ${chatTitle} (ID: ${chatId}) 已经是源群组了。`);
      } else {
        // 添加新的源群组
        sourceGroups.push({ id: chatId, enabled: true });
        const saved = saveSourceGroups(sourceGroups);
        
        if (saved) {
          // 更新运行时配置
          config.sourceChatIds = sourceGroups.filter(group => group.enabled).map(group => group.id);
          
          ctx.reply(`✅ 已成功添加源群组：${chatTitle}\n群组ID：${chatId}\n当前源群组总数：${config.sourceChatIds.length}`);
        } else {
          ctx.reply('❌ 保存源群组时出错，请稍后重试。');
        }
      }
    } else if (expecting === 'target_group_forward') {
      // 设置目标群组
      const saved = saveTargetGroup(chatId);
      
      if (saved) {
        // 更新运行时配置
        config.targetChatIds = [chatId];
        
        ctx.reply(`✅ 已成功设置目标群组：${chatTitle}\n群组ID：${chatId}`);
      } else {
        ctx.reply('❌ 保存目标群组时出错，请稍后重试。');
      }
    }
  } catch (error) {
    console.error('处理转发消息时出错:', error);
    ctx.reply('❌ 处理请求时出错，请稍后重试。');
  } finally {
    // 清除用户状态
    delete ctx.session.expecting;
  }
};

// 处理文本消息输入（用于群组ID输入等）
const handleTextInput = async (ctx) => {
  // 检查用户是否在等待输入
  if (!ctx.session || !ctx.session.expecting) {
    return;
  }
  
  try {
    const { expecting } = ctx.session;
    const inputText = ctx.message.text.trim();
    
    if (inputText === '/cancel') {
      ctx.reply('操作已取消。');
      delete ctx.session.expecting;
      return;
    }
    
    if (expecting === 'pin_on_group_id') {
      // 开启群组置顶
      if (!/^-?\d+$/.test(inputText)) {
        ctx.reply('❌ 无效的群组ID！请输入正确的数字ID。');
        return;
      }
      
      const targetChatId = inputText;
      
      // 权限预检查
      const permissionResult = await checkPinPermissions(targetChatId);
      if (!permissionResult.hasPermission) {
        if (permissionResult.error) {
          ctx.reply(`❌ 无法开启置顶：${permissionResult.error}`);
        } else {
          ctx.reply('❌ 无法开启置顶：Bot在该群组不是管理员或无置顶权限');
        }
        delete ctx.session.expecting;
        return;
      }
      
      // 更新置顶配置
      pinSettings[targetChatId] = {
        enabled: true,
        disableNotification: false
      };
      
      // 保存到文件
      const saved = savePinConfig(pinSettings);
      
      if (saved) {
        ctx.reply(`✅ 已在群组 ${targetChatId} 开启转发消息置顶功能`);
      } else {
        ctx.reply('❌ 保存置顶配置时出错，请稍后重试。');
      }
    } else if (expecting === 'pin_off_group_id') {
      // 关闭群组置顶
      if (!/^-?\d+$/.test(inputText)) {
        ctx.reply('❌ 无效的群组ID！请输入正确的数字ID。');
        return;
      }
      
      const targetChatId = inputText;
      
      // 检查群组是否在配置中
      if (!pinSettings[targetChatId] || !pinSettings[targetChatId].enabled) {
        ctx.reply(`⚠️ 群组 ${targetChatId} 的置顶功能尚未开启，无需关闭。`);
      } else {
        // 更新置顶配置
        delete pinSettings[targetChatId];
        
        // 保存到文件
        const saved = savePinConfig(pinSettings);
        
        if (saved) {
          ctx.reply(`✅ 已在群组 ${targetChatId} 关闭转发消息置顶功能`);
        } else {
          ctx.reply('❌ 保存置顶配置时出错，请稍后重试。');
        }
      }
    }
  } catch (error) {
    console.error('处理文本输入时出错:', error);
    ctx.reply('❌ 处理请求时出错，请稍后重试。');
  } finally {
    // 清除用户状态
    delete ctx.session.expecting;
  }
};

// 切换监控状态
const toggleMonitoring = (ctx) => {
  // 只有管理员可以切换监控状态
  const isAdmin = config.adminIds.length === 0 || config.adminIds.includes(ctx.from.id.toString());
  
  if (!isAdmin) {
    ctx.answerCbQuery('❌ 您没有权限执行此操作');
    return;
  }
  
  // 使用按钮加载状态辅助函数
  const buttonKey = startButtonLoading(ctx, 'toggle_monitoring');
  
  try {
    // 切换监控状态
    monitoringEnabled = !monitoringEnabled;
    
    // 获取更新后的主菜单键盘
    const menuKeyboard = getMainMenuKeyboard();
    
    // 更新主菜单按钮
    if (ctx.callbackQuery.message && ctx.callbackQuery.message.message_id) {
      ctx.editMessageReplyMarkup(menuKeyboard.reply_markup);
    }
    
    // 发送操作成功通知
    const statusMessage = monitoringEnabled ? '✅ 监控已开启，开始接收和转发消息' : '❌ 监控已关闭，将不再接收和转发消息';
    
    // 结束按钮加载状态
    endButtonLoading(buttonKey);
    
    // 显示操作结果
    setTimeout(() => {
      ctx.answerCbQuery(statusMessage, { show_alert: true });
    }, 100);
    
    // 记录日志
    if (config.debugMode) {
      console.log(`[监控状态切换] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 将监控状态设置为 ${monitoringEnabled ? '开启' : '关闭'}`);
    }
  } catch (error) {
    console.error('切换监控状态时出错:', error);
    
    // 结束按钮加载状态
    endButtonLoading(buttonKey);
    
    // 显示错误信息
    setTimeout(() => {
      ctx.answerCbQuery('❌ 操作失败：' + error.message, { show_alert: true });
    }, 100);
  }
};

// 显示群组选择界面
const showGroupSelection = async (ctx) => {
  try {
    // 显示加载状态
    ctx.answerCbQuery('⏳ 正在加载群组列表...');
    
    const targetGroups = config.targetChatIds;
    
    if (targetGroups.length === 0) {
      ctx.editMessageText('🏠 主页 > ⚙️ 配置管理 > 📌 置顶功能\n\n当前没有配置任何目标群组！\n\n请先在「群组设置」中配置目标群组。', getPinManagementKeyboard());
      return;
    }
    
    // 读取置顶配置
    const pinSettings = readPinConfig();
    
    let message = `🏠 主页 > ⚙️ 配置管理 > 📌 置顶功能 > 🎯 群组选择\n\n点击下方群组可以切换其置顶状态：\n\n`;
    
    // 更新消息并显示群组选择键盘
    ctx.editMessageText(message, getGroupSelectionKeyboard());
    
    // 记录日志
    if (config.debugMode) {
      console.log(`[显示群组选择界面] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 查看`);
    }
  } catch (error) {
    console.error('显示群组选择界面时出错:', error);
    ctx.editMessageText('❌ 加载群组列表时出错：' + error.message, getPinManagementKeyboard());
  }
};

// 切换群组置顶状态
const toggleGroupPin = async (ctx) => {
  try {
    // 提取群组ID
    const callbackData = ctx.callbackQuery.data;
    const chatId = callbackData.replace('toggle_group_pin_', '');
    
    // 显示加载状态
    ctx.answerCbQuery('⏳ 正在更新置顶状态...');
    
    // 读取当前配置
    const pinSettings = readPinConfig();
    
    // 检查Bot是否有权限
    const permissionResult = await checkPinPermissions(chatId);
    
    if (!permissionResult.hasPermission) {
      ctx.answerCbQuery(`❌ 无法切换置顶：${permissionResult.error || 'Bot在该群组没有足够权限'}`, { show_alert: true });
      return;
    }
    
    // 切换置顶状态
    const currentStatus = pinSettings[chatId] && pinSettings[chatId].enabled;
    
    if (currentStatus) {
      // 关闭置顶
      pinSettings[chatId].enabled = false;
    } else {
      // 开启置顶
      pinSettings[chatId] = pinSettings[chatId] || {};
      pinSettings[chatId].enabled = true;
      pinSettings[chatId].disableNotification = pinSettings[chatId].disableNotification || false;
    }
    
    // 保存配置
    const saved = savePinConfig(pinSettings);
    
    if (saved) {
      // 更新运行时配置
      global.pinSettings = pinSettings;
      
      // 更新界面
      ctx.editMessageReplyMarkup(getGroupSelectionKeyboard().reply_markup);
      
      // 发送操作成功通知
      const statusMessage = currentStatus ? 
        `✅ 已关闭群组 ${chatId} 的置顶功能` : 
        `✅ 已开启群组 ${chatId} 的置顶功能`;
      
      ctx.answerCbQuery(statusMessage, { show_alert: true });
      
      // 记录日志
      if (config.debugMode) {
        console.log(`[切换群组置顶] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 将群组 ${chatId} 的置顶状态设置为 ${!currentStatus ? '开启' : '关闭'}`);
      }
    } else {
      ctx.answerCbQuery('❌ 保存配置时出错，请稍后重试', { show_alert: true });
    }
  } catch (error) {
    console.error('切换群组置顶状态时出错:', error);
    ctx.answerCbQuery('❌ 操作失败：' + error.message, { show_alert: true });
  }
};

// 显示帮助说明
const showHelp = (ctx) => {
  const helpMessage = `❓ 帮助说明\n\n`;
  
  // 基本功能
  helpMessage += `🔍 机器人功能：\n`;
  helpMessage += `- 自动监听源群组的消息\n`;
  helpMessage += `- 对文本消息应用替换规则\n`;
  helpMessage += `- 将消息转发到所有目标群组\n`;
  helpMessage += `- 支持消息置顶功能\n\n`;
  
  // 通用命令
  helpMessage += `💬 通用命令：\n`;
  helpMessage += `/start - 显示主菜单\n`;
  helpMessage += `/menu - 显示主菜单\n`;
  helpMessage += `/help - 查看详细帮助信息\n\n`;
  
  // 管理命令提示
  helpMessage += `👑 管理命令：\n`;
  helpMessage += `/admin_status - 查看机器人详细状态\n`;
  helpMessage += `/add_source <chat_id> - 添加源群组\n`;
  helpMessage += `/set_target <chat_id> - 设置目标群组\n`;
  helpMessage += `/add_rule <旧词> <新词> - 添加替换规则\n`;
  helpMessage += `/pin_on <target_chat_id> - 开启置顶功能\n\n`;
  
  helpMessage += `💡 提示：更多命令请使用 /help 查看完整列表。`;
  
  ctx.editMessageText(helpMessage, getBackToMainMenuButton());
};

// 处理确认对话框回调
bot.action(/^confirm_/, async (ctx) => {
  try {
    const callbackData = ctx.callbackQuery.data;
    const callbackId = callbackData.replace('confirm_', '');
    
    // 检查用户会话中是否有该确认操作
    if (!ctx.session || !ctx.session.confirmationActions || !ctx.session.confirmationActions[callbackId]) {
      ctx.answerCbQuery('❌ 确认操作已过期，请重试');
      return;
    }
    
    const actions = ctx.session.confirmationActions[callbackId];
    
    // 执行确认操作
    if (typeof actions.confirm === 'function') {
      await actions.confirm(ctx);
    }
    
    // 删除该确认操作
    delete ctx.session.confirmationActions[callbackId];
  } catch (error) {
    console.error('处理确认操作时出错:', error);
    ctx.answerCbQuery('❌ 处理确认操作时出错，请重试');
  }
});

bot.action(/^cancel_/, async (ctx) => {
  try {
    const callbackData = ctx.callbackQuery.data;
    const callbackId = callbackData.replace('cancel_', '');
    
    // 检查用户会话中是否有该确认操作
    if (!ctx.session || !ctx.session.confirmationActions || !ctx.session.confirmationActions[callbackId]) {
      ctx.answerCbQuery('操作已取消');
      return;
    }
    
    const actions = ctx.session.confirmationActions[callbackId];
    
    // 执行取消操作（如果有）
    if (typeof actions.cancel === 'function') {
      await actions.cancel(ctx);
    }
    
    // 删除该确认操作
    delete ctx.session.confirmationActions[callbackId];
    
    ctx.answerCbQuery('操作已取消');
  } catch (error) {
    console.error('处理取消操作时出错:', error);
    ctx.answerCbQuery('❌ 处理取消操作时出错');
  }
});

// 处理所有回调查询

// 处理返回主页回调
bot.action('back_to_main', handleBackToMain);

// 处理状态看板回调
bot.action('status_dashboard', showStatusDashboard);

// 处理配置管理回调
bot.action('config_menu', showConfigMenu);

// 处理切换监控状态回调
bot.action('toggle_monitoring', toggleMonitoring);

// 处理一键开启/关闭所有源群组监控
bot.action('enable_all_groups', async (ctx) => {
  await toggleAllSourceGroups(ctx, true);
});

bot.action('disable_all_groups', async (ctx) => {
  await toggleAllSourceGroups(ctx, false);
});

// 处理刷新数据
bot.action('refresh_dashboard', async (ctx) => {
  try {
    // 使用按钮加载状态
    const buttonKey = startButtonLoading(ctx, 'refresh_dashboard');
    
    // 刷新状态看板
    await showStatusDashboard(ctx);
    
    // 结束按钮加载状态
    endButtonLoading(buttonKey);
    
    ctx.answerCbQuery('✅ 数据已刷新');
  } catch (error) {
    console.error('刷新数据时出错:', error);
    ctx.answerCbQuery('❌ 刷新数据时出错，请重试');
  }
});

// 处理帮助说明回调
bot.action('show_help', showHelp);

// 处理配置管理二级菜单回调
bot.action('group_management', showGroupManagement);
bot.action('rule_management', showRuleManagement);
bot.action('pin_management', showPinManagement);

// 处理置顶功能相关回调
bot.action('show_group_selection', showGroupSelection);
bot.action('enable_pin', handleEnablePin);
bot.action('disable_pin', handleDisablePin);
bot.action('check_pin_status', handleCheckPinStatus);
bot.action('pin_details', handlePinDetails);

// 处理群组置顶状态切换（使用正则表达式匹配）
bot.action(/^toggle_group_pin_\d+$/, toggleGroupPin);

// 处理开启置顶
const handleEnablePin = (ctx) => {
  ctx.editMessageText('请输入您想要开启置顶功能的群组ID：\n\n取消操作请发送 /cancel');
  ctx.session = ctx.session || {};
  ctx.session.expecting = 'pin_on_group_id';
};

// 处理关闭置顶
const handleDisablePin = (ctx) => {
  ctx.editMessageText('请输入您想要关闭置顶功能的群组ID：\n\n取消操作请发送 /cancel');
  ctx.session = ctx.session || {};
  ctx.session.expecting = 'pin_off_group_id';
};

// 处理查看置顶状态
const handleCheckPinStatus = async (ctx) => {
  try {
    // 读取当前置顶配置
    const currentPinSettings = readPinConfig();
    const chatIds = Object.keys(currentPinSettings);
    
    if (chatIds.length === 0) {
      const message = `🏠 主页 > ⚙️ 配置管理 > 📌 置顶功能 > 📋 置顶状态\n\n当前没有配置任何群组的置顶功能。\n\n请使用"开启群组置顶"功能开启置顶功能。`;
      ctx.editMessageText(message, getPinManagementKeyboard());
      return;
    }
    
    // 格式化置顶状态列表
    let statusList = `🏠 主页 > ⚙️ 配置管理 > 📌 置顶功能 > 📋 置顶状态\n\n`;
    let enabledCount = 0;
    
    chatIds.forEach((chatId, index) => {
      const settings = currentPinSettings[chatId];
      const isEnabled = settings && settings.enabled;
      const statusEmoji = isEnabled ? '✅' : '❌';
      const statusText = isEnabled ? '开启' : '关闭';
      
      if (isEnabled) {
        enabledCount++;
      }
      
      statusList += `• 群组 ${chatId}: ${statusEmoji} ${statusText}\n`;
    });
    
    statusList += `\n💡 统计信息：\n- 总配置群组数量：${chatIds.length}\n- 开启置顶的群组数量：${enabledCount}\n- 关闭置顶的群组数量：${chatIds.length - enabledCount}`;
    
    // 更新消息并跟踪界面
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      const screenKey = `${ctx.from.id}_pin_status`;
      activeScreens.set(screenKey, {
        chatId: ctx.chat.id,
        messageId: ctx.callbackQuery.message.message_id,
        type: 'pin_management'
      });
    }
    
    ctx.editMessageText(statusList, getPinManagementKeyboard());
  } catch (error) {
    console.error('处理查看置顶状态时出错:', error);
    ctx.editMessageText('❌ 处理请求时出错，请稍后重试。', getPinManagementKeyboard());
  }
};

// 处理查看置顶配置详情
const handlePinDetails = async (ctx) => {
  try {
    // 读取当前置顶配置
    const currentPinSettings = readPinConfig();
    const chatIds = Object.keys(currentPinSettings);
    
    if (chatIds.length === 0) {
      const message = `🏠 主页 > ⚙️ 配置管理 > 📌 置顶功能 > 🔍 置顶配置详情\n\n当前没有配置任何群组的置顶功能。\n\n请使用"开启群组置顶"功能开启置顶功能。`;
      ctx.editMessageText(message, getPinManagementKeyboard());
      return;
    }
    
    // 构建详细配置信息
    let detailMessage = `🏠 主页 > ⚙️ 配置管理 > 📌 置顶功能 > 🔍 置顶配置详情\n\n`;
    
    chatIds.forEach((chatId) => {
      const settings = currentPinSettings[chatId];
      const statusEmoji = settings && settings.enabled ? '✅' : '❌';
      const statusText = settings && settings.enabled ? '开启' : '关闭';
      const notificationStatus = settings && settings.disableNotification ? '不通知' : '通知';
      
      detailMessage += `🔹 群组ID：${chatId}\n`;
      detailMessage += `   • 置顶状态：${statusEmoji} ${statusText}\n`;
      detailMessage += `   • 通知设置：${notificationStatus}群成员\n\n`;
    });
    
    // 添加统计信息
    const enabledCount = Object.values(currentPinSettings).filter(s => s && s.enabled).length;
    const disableNotifyCount = Object.values(currentPinSettings).filter(s => s && s.enabled && s.disableNotification).length;
    
    detailMessage += '📈 统计摘要：\n';
    detailMessage += `- 总配置群组数量：${chatIds.length}\n`;
    detailMessage += `- 开启置顶的群组数量：${enabledCount}\n`;
    detailMessage += `- 开启置顶且不通知的群组数量：${disableNotifyCount}`;
    
    // 更新消息并跟踪界面
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      const screenKey = `${ctx.from.id}_pin_details`;
      activeScreens.set(screenKey, {
        chatId: ctx.chat.id,
        messageId: ctx.callbackQuery.message.message_id,
        type: 'pin_management'
      });
    }
    
    ctx.editMessageText(detailMessage, getPinManagementKeyboard());
  } catch (error) {
    console.error('处理查看置顶配置详情时出错:', error);
    ctx.editMessageText('❌ 处理请求时出错，请稍后重试。', getPinManagementKeyboard());
  }
};

// 处理群组管理回调
bot.action('add_source_group', handleAddSourceGroup);
bot.action('set_target_group', handleSetTargetGroup);
bot.action('list_source_groups', handleListSourceGroups);
bot.action('list_target_groups', handleListTargetGroups);

// 处理替换规则管理回调
bot.action('add_replacement_rule', handleAddReplacementRule);
bot.action('view_replacement_rules', handleViewReplacementRules);

// 处理置顶功能管理回调
bot.action('enable_pin', handleEnablePin);
bot.action('disable_pin', handleDisablePin);
bot.action('check_pin_status', handleCheckPinStatus);
bot.action('pin_details', handlePinDetails);

// 批量配置管理命令

// /export_config 命令 - 导出所有配置到JSON文件
bot.command('export_config', isAdmin, async (ctx) => {
  try {
    // 收集所有配置
    const allConfig = {
      sources: readSourceGroups(),
      target: readTargetGroup(),
      rules: readReplacementRules(),
      exportTime: new Date().toISOString(),
      botName: config.botName
    };
    
    // 将配置转换为JSON字符串
    const configJson = JSON.stringify(allConfig, null, 2);
    
    // 创建一个临时文件或使用缓冲区发送
    const buffer = Buffer.from(configJson, 'utf8');
    
    // 发送配置文件给用户
    await ctx.replyWithDocument({
      source: buffer,
      filename: `bot_config_${Date.now()}.json`
    }, {
      caption: '✅ 配置导出成功！\n\n此文件包含所有源群组、目标群组和替换规则配置。\n请妥善保管，并可通过 /import_config 命令导入。'
    });
    
    if (config.debugMode) {
      console.log(`[配置已导出] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 导出配置`);
    }
  } catch (error) {
    console.error('导出配置时出错:', error);
    ctx.reply('❌ 导出配置时出错，请稍后重试。');
  }
});

// /import_config 命令 - 从JSON文件导入配置
bot.command('import_config', isAdmin, async (ctx) => {
  try {
    // 检查是否有回复的消息并且包含文件
    if (!ctx.message.reply_to_message || !ctx.message.reply_to_message.document) {
      return ctx.reply('❌ 请回复一个配置文件（JSON格式）来导入配置。\n\n使用方法：\n1. 先发送配置文件\n2. 然后回复这个文件，输入 /import_config');
    }
    
    // 提示用户确认导入
    ctx.reply('⚠️ 警告：导入配置将完全覆盖当前所有设置！\n\n请确认是否继续？\n\n发送「确认」继续导入，发送其他内容取消操作。', {
      reply_to_message_id: ctx.message.message_id
    });
    
    // 等待用户确认
    bot.once('message', async (confirmCtx) => {
      // 检查是否是对同一消息的回复，并且是同一用户发送的
      if (confirmCtx.message.reply_to_message && 
          confirmCtx.message.reply_to_message.message_id === ctx.message.message_id &&
          confirmCtx.from.id === ctx.from.id) {
        
        if (confirmCtx.message.text.toLowerCase() === '确认') {
          try {
            // 获取文件信息
            const fileId = ctx.message.reply_to_message.document.file_id;
            const file = await ctx.telegram.getFile(fileId);
            const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
            
            // 下载文件内容
            const response = await fetch(fileUrl);
            const configJson = await response.text();
            
            // 解析JSON配置
            const importedConfig = JSON.parse(configJson);
            
            // 验证配置格式
            if (!importedConfig.sources || !Array.isArray(importedConfig.sources)) {
              throw new Error('无效的源群组配置');
            }
            
            // 保存配置到文件
            const sourcesSaved = saveSourceGroups(importedConfig.sources);
            
            let targetSaved = true;
            if ('target' in importedConfig) {
              targetSaved = saveTargetGroup(importedConfig.target);
            }
            
            let rulesSaved = true;
            if (importedConfig.rules) {
              rulesSaved = saveReplacementRules(importedConfig.rules);
            }
            
            // 更新运行时配置
            if (sourcesSaved) config.sourceChatIds = importedConfig.sources;
            if (targetSaved && importedConfig.target) config.targetChatIds = [importedConfig.target];
            if (rulesSaved && importedConfig.rules) config.textReplaceRules = importedConfig.rules;
            
            // 发送导入成功消息
            confirmCtx.reply(`✅ 配置导入成功！\n\n更新的配置：\n- 源群组数量：${config.sourceChatIds.length}\n- 目标群组：${config.targetChatIds.length > 0 ? config.targetChatIds[0] : '未设置'}\n- 替换规则数量：${Object.keys(config.textReplaceRules).length}\n\n机器人已应用新配置，所有活跃界面将自动更新。`);
            
            // 触发全局自动刷新
            setTimeout(() => {
              triggerConfigUpdate('all');
            }, 100);
            
            if (config.debugMode) {
              console.log(`[配置已导入] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 导入配置`);
            }
            
          } catch (importError) {
            console.error('导入配置时出错:', importError);
            confirmCtx.reply(`❌ 导入配置失败：${importError.message}\n\n请检查文件格式是否正确。`);
          }
        } else {
          // 用户取消导入
          confirmCtx.reply('✅ 配置导入已取消。');
        }
      }
    });
  } catch (error) {
    console.error('处理导入配置命令时出错:', error);
    ctx.reply('❌ 处理命令时出错，请稍后重试。');
  }
});

// 可选的定时任务示例
// 每天凌晨1点执行的任务
cron.schedule('0 1 * * *', () => {
  if (config.debugMode) {
    console.log('执行每日维护任务...');
    // 可以在这里添加一些维护任务，比如清理日志等
  }
});

// 处理转发消息获取群组ID
async function handleForwardedMessage(ctx) {
  try {
    let chatId = '';
    
    // 检查是否为转发消息
    if (ctx.message.forward_from_chat) {
      chatId = ctx.message.forward_from_chat.id.toString();
    } else if (ctx.message.from_chat_id) {
      chatId = ctx.message.from_chat_id.toString();
    } else {
      ctx.reply('❌ 请转发一条有效的群组消息，以便我能获取群组ID。');
      return;
    }
    
    // 提示用户使用场景模式添加群组
    ctx.reply(`📌 检测到群组消息转发\n\n群组ID: ${chatId}\n\n请使用 /menu -> 配置管理 -> 群组设置 -> 添加源群组/设置目标群组 来添加群组。`);
  } catch (error) {
    console.error('处理转发消息时出错:', error);
    ctx.reply('❌ 处理转发消息时出错，请稍后重试。');
  }
}

// 处理文本输入 - 现在主要通过场景模式处理
async function handleTextInput(ctx) {
  try {
    const input = ctx.message.text.trim();
    
    // 检查用户是否在等待特定输入
    if (ctx.session && ctx.session.expecting) {
      const { expecting } = ctx.session;
      
      if (input === '/cancel') {
        ctx.reply('操作已取消。');
        delete ctx.session.expecting;
        delete ctx.session.currentGroupId;
        delete ctx.session.oldWord;
        return;
      }
      
      // 处理等待群组ID输入的情况
      if (expecting === 'group_id_for_rule') {
        // 验证群组ID格式
        if (!/^-?\d+$/.test(input)) {
          ctx.reply('❌ 无效的群组ID！请输入正确的数字ID。\n\n取消操作请发送 /cancel');
          return;
        }
        
        const groupId = input;
        
        // 读取群组规则配置
        const groupRulesConfig = readGroupRulesConfig();
        
        // 确保群组配置存在
        if (!groupRulesConfig.group_specific_rules[groupId]) {
          groupRulesConfig.group_specific_rules[groupId] = {
            enabled: true,
            inherit_global: true,
            rules: {}
          };
          
          // 保存配置
          saveGroupRulesConfig(groupRulesConfig);
        }
        
        // 重新显示群组规则设置界面以更新状态
        await showGroupRulesSettings(ctx);
        
        // 提示用户群组配置已创建
        ctx.reply(`✅ 群组 ${groupId} 的规则配置已创建！\n\n您可以点击该群组行进入详情页面进行进一步设置。`);
        
        // 清除等待状态
        delete ctx.session.expecting;
        delete ctx.session.menuLevel;
        return;
      }
      
      // 处理等待旧词输入的情况
      if (expecting === 'old_word_for_group_rule') {
        if (!input) {
          ctx.reply('❌ 替换的文本不能为空！请重新输入。\n\n取消操作请发送 /cancel');
          return;
        }
        
        // 保存旧词到会话
        ctx.session.oldWord = input;
        ctx.session.expecting = 'new_word_for_group_rule';
        
        ctx.reply(`请输入替换后的文本（新词）：\n\n群组ID: ${ctx.session.currentGroupId}\n旧词: "${input}"\n\n取消操作请发送 /cancel`);
        return;
      }
      
      // 处理等待新词输入的情况
      if (expecting === 'new_word_for_group_rule') {
        const { currentGroupId, oldWord } = ctx.session;
        
        // 读取群组规则配置
        const groupRulesConfig = readGroupRulesConfig();
        
        // 确保群组配置存在
        if (!groupRulesConfig.group_specific_rules[currentGroupId]) {
          groupRulesConfig.group_specific_rules[currentGroupId] = {
            enabled: true,
            inherit_global: true,
            rules: {}
          };
        }
        
        // 检查是否与全局规则冲突
        let conflictWarning = '';
        if (groupRulesConfig.global_rules[oldWord] && groupRulesConfig.global_rules[oldWord] !== input) {
          conflictWarning = `\n\n⚠️ 注意：该规则与全局规则冲突，在群组 ${currentGroupId} 中，将优先使用本群组规则。\n全局规则: '${oldWord}' -> '${groupRulesConfig.global_rules[oldWord]}'`;
        }
        
        // 添加或更新规则
        groupRulesConfig.group_specific_rules[currentGroupId].rules[oldWord] = input;
        
        // 保存配置
        const saveResult = saveGroupRulesConfig(groupRulesConfig);
        
        if (saveResult) {
          ctx.reply(`✅ 已在群组 ${currentGroupId} 添加专属规则：\n'${oldWord}' → '${input}'${conflictWarning}`);
          
          // 重新显示专属规则管理界面
          await handleManageGroupSpecificRules(ctx, currentGroupId);
        } else {
          ctx.reply('❌ 保存规则时出错，请稍后重试。');
        }
        
        // 清除等待状态
        delete ctx.session.expecting;
        delete ctx.session.currentGroupId;
        delete ctx.session.oldWord;
        return;
      }
      
      // 处理测试规则文本输入
      if (expecting === 'test_rule_text') {
        const { currentGroupId } = ctx.session;
        
        try {
          // 获取该群组的有效规则
          const effectiveRules = await getEffectiveRules(currentGroupId);
          
          // 应用规则替换
          let outputText = input;
          if (effectiveRules && Object.keys(effectiveRules).length > 0) {
            // 应用所有有效规则
            for (const [oldWord, newWord] of Object.entries(effectiveRules)) {
              const regex = new RegExp(oldWord, 'g');
              outputText = outputText.replace(regex, newWord);
            }
          }
          
          // 显示测试结果
          ctx.reply(`🧪 规则测试结果：\n\n测试输入: ${input}\n\n输出: ${outputText}\n\n群组ID: ${currentGroupId}\n应用有效规则数量: ${effectiveRules ? Object.keys(effectiveRules).length : 0}`);
          
          // 清除等待状态
          delete ctx.session.expecting;
          delete ctx.session.currentGroupId;
        } catch (error) {
          console.error('处理规则测试时出错:', error);
          ctx.reply('❌ 测试规则时出错，请稍后重试。');
        }
        
        return;
      }
      
      // 处理群组配置文件导入
      if (expecting === 'group_config_file') {
        // 检查是否有文件
        if (ctx.message.document) {
          try {
            // 提示用户确认导入
            ctx.reply('⚠️ 警告：导入群组配置将完全覆盖当前所有群组规则设置！\n\n请确认是否继续？\n\n发送「确认」继续导入，发送其他内容取消操作。');
            
            // 保存文件信息到会话
            ctx.session.fileId = ctx.message.document.file_id;
            ctx.session.expecting = 'confirm_group_config_import';
          } catch (error) {
            console.error('处理配置文件时出错:', error);
            ctx.reply('❌ 处理配置文件时出错，请稍后重试。');
            delete ctx.session.expecting;
          }
        } else {
          ctx.reply('❌ 请发送有效的JSON配置文件。\n\n取消操作请发送 /cancel');
        }
        
        return;
      }
      
      // 处理确认导入群组配置
      if (expecting === 'confirm_group_config_import') {
        if (input.toLowerCase() === '确认') {
          try {
            // 获取文件信息
            const file = await ctx.telegram.getFile(ctx.session.fileId);
            const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
            
            // 下载文件内容
            const response = await fetch(fileUrl);
            const configJson = await response.text();
            
            // 解析JSON配置
            const importedConfig = JSON.parse(configJson);
            
            // 验证配置格式
            if (!importedConfig.global_rules || !importedConfig.group_specific_rules) {
              throw new Error('无效的群组规则配置文件格式');
            }
            
            // 保存配置到文件
            const saved = saveGroupRulesConfig(importedConfig);
            
            if (saved) {
              ctx.reply(`✅ 群组规则配置导入成功！\n\n已导入：\n- 全局规则数量：${Object.keys(importedConfig.global_rules).length}\n- 配置的群组数量：${Object.keys(importedConfig.group_specific_rules).length}\n\n所有群组规则设置已更新。`);
              
              // 触发配置更新事件，刷新相关界面
              setTimeout(() => {
                triggerConfigUpdate('replacement_rules');
              }, 100);
              
              if (config.debugMode) {
                console.log(`[群组配置已导入] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 导入配置`);
              }
            } else {
              ctx.reply('❌ 保存群组规则配置时出错，请稍后重试。');
            }
          } catch (importError) {
            console.error('导入群组配置时出错:', importError);
            ctx.reply(`❌ 导入群组配置失败：${importError.message}\n\n请检查文件格式是否正确。`);
          }
        } else {
          // 用户取消导入
          ctx.reply('✅ 群组配置导入已取消。');
        }
        
        // 清除等待状态
        delete ctx.session.expecting;
        delete ctx.session.fileId;
        return;
      }
    }
    
    // 检查是否为有效的群组ID（数字）
    if (/^-?\d+$/.test(input)) {
      const chatId = input;
      
      // 提示用户使用场景模式或命令行操作
      ctx.reply(`📌 检测到群组ID输入\n\n群组ID: ${chatId}\n\n您可以：\n1. 使用 /menu -> 配置管理 来管理群组\n2. 使用命令：/add_source <chat_id> 或 /set_target <chat_id>`);
    } else {
      // 其他文本输入处理可以在这里添加
      ctx.reply('请使用菜单或命令进行操作。');
    }
  } catch (error) {
    console.error('处理文本输入时出错:', error);
    ctx.reply('❌ 处理输入时出错，请稍后重试。');
  }
}

// 取消操作命令
bot.command('cancel', (ctx) => {
  // 退出当前场景（如果在场景中）
  if (ctx.scene && ctx.scene.current) {
    ctx.scene.leave();
  }
  
  // 保持向后兼容性
  if (ctx.session) {
    delete ctx.session.expecting;
  }
  
  ctx.reply('操作已取消。', getMainMenuKeyboard());
});

// 启动机器人
bot.launch().then(() => {
  console.log(`${config.botName} 已成功启动！`);
  console.log(`调试模式: ${config.debugMode ? '开启' : '关闭'}`);
}).catch((error) => {
  console.error(`${config.botName} 启动失败:`, error);
});

// 处理进程终止信号，优雅地关闭机器人
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// 处理群组规则设置回调
bot.action(/^group_rules_settings$/, async (ctx) => {
  try {
    // 检查管理员权限
    if (!await checkAdminPermission(ctx)) {
      return;
    }
    
    await showGroupRulesSettings(ctx);
  } catch (error) {
    console.error('处理群组规则设置回调时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
});

// 处理管理群组规则回调
bot.action(/^manage_group_rules:(.+)$/, async (ctx) => {
  try {
    // 检查管理员权限
    if (!await checkAdminPermission(ctx)) {
      return;
    }
    
    const groupId = ctx.match[1];
    await showGroupRuleDetails(ctx, groupId);
  } catch (error) {
    console.error('处理管理群组规则回调时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
});

// 处理切换群组规则状态回调
bot.action(/^toggle_group_rules:(.+)$/, async (ctx) => {
  try {
    // 检查管理员权限
    if (!await checkAdminPermission(ctx)) {
      return;
    }
    
    const groupId = ctx.match[1];
    await toggleGroupRules(ctx, groupId);
  } catch (error) {
    console.error('处理切换群组规则状态回调时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
});

// 处理切换继承全局规则回调
bot.action(/^toggle_inherit_global:(.+)$/, async (ctx) => {
  try {
    // 检查管理员权限
    if (!await checkAdminPermission(ctx)) {
      return;
    }
    
    const groupId = ctx.match[1];
    await toggleInheritGlobal(ctx, groupId);
  } catch (error) {
    console.error('处理切换继承全局规则回调时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
});

// 处理查看生效规则回调
bot.action(/^view_effective_rules:(.+)$/, async (ctx) => {
  try {
    // 检查管理员权限
    if (!await checkAdminPermission(ctx)) {
      return;
    }
    
    const groupId = ctx.match[1];
    await handleViewEffectiveRules(ctx, groupId);
  } catch (error) {
    console.error('处理查看生效规则回调时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
});

// 处理添加新群组规则回调
bot.action(/^add_new_group_rule$/, async (ctx) => {
  try {
    // 检查管理员权限
    if (!await checkAdminPermission(ctx)) {
      return;
    }
    
    handleAddNewGroupRule(ctx);
  } catch (error) {
    console.error('处理添加新群组规则回调时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
});

// 处理管理专属规则回调
bot.action(/^manage_group_specific_rules:(.+)$/, async (ctx) => {
  try {
    // 检查管理员权限
    if (!await checkAdminPermission(ctx)) {
      return;
    }
    
    const groupId = ctx.match[1];
    await handleManageGroupSpecificRules(ctx, groupId);
  } catch (error) {
    console.error('处理管理专属规则回调时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
});

// 处理添加群组专属规则回调
bot.action(/^add_group_specific_rule:(.+)$/, async (ctx) => {
  try {
    // 检查管理员权限
    if (!await checkAdminPermission(ctx)) {
      return;
    }
    
    const groupId = ctx.match[1];
    handleAddGroupSpecificRule(ctx, groupId);
  } catch (error) {
    console.error('处理添加群组专属规则回调时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
});

// 处理批量启用规则回调
bot.action('batch_enable_rules', async (ctx) => {
  try {
    // 检查管理员权限
    if (!await checkAdminPermission(ctx)) {
      return;
    }
    
    // 显示批量操作界面，操作类型为启用
    await showBatchOperationScreen(ctx, 'enable');
  } catch (error) {
    console.error('处理批量启用规则回调时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
});

// 处理批量禁用规则回调
bot.action('batch_disable_rules', async (ctx) => {
  try {
    // 检查管理员权限
    if (!await checkAdminPermission(ctx)) {
      return;
    }
    
    // 显示批量操作界面，操作类型为禁用
    await showBatchOperationScreen(ctx, 'disable');
  } catch (error) {
    console.error('处理批量禁用规则回调时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
});

// 处理导出群组配置回调
bot.action('export_group_config', async (ctx) => {
  try {
    // 检查管理员权限
    if (!await checkAdminPermission(ctx)) {
      return;
    }
    
    // 导出群组配置
    await exportGroupConfig(ctx);
  } catch (error) {
    console.error('处理导出群组配置回调时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
});

// 处理导入群组配置回调
bot.action('import_group_config', async (ctx) => {
  try {
    // 检查管理员权限
    if (!await checkAdminPermission(ctx)) {
      return;
    }
    
    // 提示用户发送配置文件
    ctx.reply('请发送要导入的群组配置文件（JSON格式）：\n\n取消操作请发送 /cancel');
    
    // 记录用户的当前操作
    ctx.session = ctx.session || {};
    ctx.session.expecting = 'group_config_file';
  } catch (error) {
    console.error('处理导入群组配置回调时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
});

// 处理群组复选框选择回调
bot.action(/^select_group_([^_]+)_([^_]+)$/, async (ctx) => {
  try {
    // 检查管理员权限
    if (!await checkAdminPermission(ctx)) {
      return;
    }
    
    const groupId = ctx.match[1];
    const operation = ctx.match[2]; // enable 或 disable
    
    // 初始化会话中的选中群组列表
    ctx.session = ctx.session || {};
    ctx.session.selectedGroups = ctx.session.selectedGroups || {};
    ctx.session.currentBatchOperation = operation;
    
    // 切换群组的选中状态
    if (ctx.session.selectedGroups[groupId]) {
      delete ctx.session.selectedGroups[groupId];
    } else {
      ctx.session.selectedGroups[groupId] = true;
    }
    
    // 重新显示批量操作界面
    await showBatchOperationScreen(ctx, operation);
  } catch (error) {
    console.error('处理群组选择回调时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
});

// 处理全选按钮回调
bot.action(/^select_all_groups_([^_]+)$/, async (ctx) => {
  try {
    // 检查管理员权限
    if (!await checkAdminPermission(ctx)) {
      return;
    }
    
    const operation = ctx.match[1]; // enable 或 disable
    
    // 读取群组规则配置
    const groupRulesConfig = readGroupRulesConfig();
    const configuredGroups = Object.keys(groupRulesConfig.group_specific_rules);
    
    // 初始化会话中的选中群组列表
    ctx.session = ctx.session || {};
    ctx.session.selectedGroups = {};
    ctx.session.currentBatchOperation = operation;
    
    // 全选所有群组
    configuredGroups.forEach(groupId => {
      ctx.session.selectedGroups[groupId] = true;
    });
    
    // 重新显示批量操作界面
    await showBatchOperationScreen(ctx, operation);
  } catch (error) {
    console.error('处理全选按钮回调时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
});

// 处理反选按钮回调
bot.action(/^select_inverse_groups_([^_]+)$/, async (ctx) => {
  try {
    // 检查管理员权限
    if (!await checkAdminPermission(ctx)) {
      return;
    }
    
    const operation = ctx.match[1]; // enable 或 disable
    
    // 读取群组规则配置
    const groupRulesConfig = readGroupRulesConfig();
    const configuredGroups = Object.keys(groupRulesConfig.group_specific_rules);
    
    // 初始化会话中的选中群组列表
    ctx.session = ctx.session || {};
    ctx.session.selectedGroups = ctx.session.selectedGroups || {};
    ctx.session.currentBatchOperation = operation;
    
    // 反选所有群组
    configuredGroups.forEach(groupId => {
      if (ctx.session.selectedGroups[groupId]) {
        delete ctx.session.selectedGroups[groupId];
      } else {
        ctx.session.selectedGroups[groupId] = true;
      }
    });
    
    // 重新显示批量操作界面
    await showBatchOperationScreen(ctx, operation);
  } catch (error) {
    console.error('处理反选按钮回调时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
});

// 处理确认批量操作回调
bot.action(/^confirm_batch_operation_([^_]+)$/, async (ctx) => {
  try {
    // 检查管理员权限
    if (!await checkAdminPermission(ctx)) {
      return;
    }
    
    const operation = ctx.match[1]; // enable 或 disable
    
    // 检查是否有选中的群组
    if (!ctx.session || !ctx.session.selectedGroups) {
      ctx.answerCbQuery('❌ 没有选中任何群组', { show_alert: true });
      return;
    }
    
    const selectedGroups = Object.keys(ctx.session.selectedGroups);
    if (selectedGroups.length === 0) {
      ctx.answerCbQuery('❌ 没有选中任何群组', { show_alert: true });
      return;
    }
    
    // 执行批量操作
    await performBatchOperation(ctx, selectedGroups, operation);
  } catch (error) {
    console.error('处理确认批量操作回调时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
});

// 注册快速操作按钮的回调处理函数
bot.action(/^quick_toggle:(.+)$/, async (ctx) => {
  try {
    // 检查管理员权限
    if (!await checkAdminPermission(ctx)) {
      return;
    }
    
    const groupId = ctx.match[1];
    await quickToggleGroupRules(ctx, groupId);
  } catch (error) {
    console.error('处理快速切换群组规则状态回调时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
});

bot.action(/^quick_toggle_inherit:(.+)$/, async (ctx) => {
  try {
    // 检查管理员权限
    if (!await checkAdminPermission(ctx)) {
      return;
    }
    
    const groupId = ctx.match[1];
    await quickToggleInheritGlobal(ctx, groupId);
  } catch (error) {
    console.error('处理快速切换继承全局规则回调时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
});

bot.action(/^quick_view_effective:(.+)$/, async (ctx) => {
  try {
    // 检查管理员权限
    if (!await checkAdminPermission(ctx)) {
      return;
    }
    
    const groupId = ctx.match[1];
    await quickViewEffectiveRules(ctx, groupId);
  } catch (error) {
    console.error('处理快速查看生效规则回调时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
});

bot.action('view_all_effective_rules', async (ctx) => {
  try {
    // 检查管理员权限
    if (!await checkAdminPermission(ctx)) {
      return;
    }
    
    await viewAllEffectiveRules(ctx);
  } catch (error) {
    console.error('处理查看所有生效规则回调时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
});

// 显示批量操作界面
const showBatchOperationScreen = async (ctx, operation) => {
  try {
    // 记录用户的菜单层级
    if (ctx.session) {
      ctx.session.menuLevel = 'batch_operation';
      ctx.session.currentBatchOperation = operation;
      ctx.session.selectedGroups = ctx.session.selectedGroups || {};
    }
    
    // 使用按钮加载状态
    const buttonKey = startButtonLoading(ctx, `batch_${operation}_rules`);
    
    // 读取群组规则配置
    const groupRulesConfig = readGroupRulesConfig();
    const configuredGroups = Object.keys(groupRulesConfig.group_specific_rules);
    
    // 构建批量操作界面消息
    let message = `🏠 主页 > ⚙️ 配置管理 > 📝 替换规则 > 👥 群组规则设置 > ${operation === 'enable' ? '✅ 批量启用规则' : '❌ 批量禁用规则'}\n\n`;
    message += `请选择要${operation === 'enable' ? '启用' : '禁用'}规则的群组：\n\n`;
    
    if (configuredGroups.length === 0) {
      message += `📝 当前没有为任何群组配置特定规则。\n\n请先添加群组规则后再进行批量操作。`;
    } else {
      // 显示群组列表和选择状态
      configuredGroups.forEach((groupId, index) => {
        const groupSettings = groupRulesConfig.group_specific_rules[groupId];
        const isEnabled = groupSettings.enabled || false;
        const isSelected = ctx.session && ctx.session.selectedGroups && ctx.session.selectedGroups[groupId] ? true : false;
        
        message += `${index + 1}. 群组ID: ${groupId}\n`;
        message += `   • 当前状态: ${isEnabled ? '✅ 启用' : '❌ 禁用'}\n`;
        message += `   • 已${isSelected ? '选中' : '未选中'}\n\n`;
      });
      
      message += `已选择 ${ctx.session && ctx.session.selectedGroups ? Object.keys(ctx.session.selectedGroups).length : 0} 个群组`;
    }
    
    // 创建批量操作键盘
    const keyboard = {
      reply_markup: {
        inline_keyboard: []
      }
    };
    
    if (configuredGroups.length > 0) {
      // 为每个群组添加选择按钮
      configuredGroups.forEach((groupId) => {
        const isSelected = ctx.session && ctx.session.selectedGroups && ctx.session.selectedGroups[groupId] ? true : false;
        keyboard.reply_markup.inline_keyboard.push([
          { 
            text: `${isSelected ? '✅' : '⬜'} 群组 ${groupId}`, 
            callback_data: `select_group_${groupId}_${operation}` 
          }
        ]);
      });
      
      // 添加全选、反选和确认按钮
      keyboard.reply_markup.inline_keyboard.push([
        { text: '全选', callback_data: `select_all_groups_${operation}` },
        { text: '反选', callback_data: `select_inverse_groups_${operation}` }
      ]);
      keyboard.reply_markup.inline_keyboard.push([
        { text: `${operation === 'enable' ? '✅ 确认批量启用' : '❌ 确认批量禁用'}`, callback_data: `confirm_batch_operation_${operation}` }
      ]);
    }
    
    // 添加返回按钮
    keyboard.reply_markup.inline_keyboard.push([
      { text: '🔙 返回群组规则设置', callback_data: 'group_rules_settings' }
    ]);
    
    // 更新消息
    ctx.editMessageText(message, keyboard);
    
    // 结束按钮加载状态
    endButtonLoading(buttonKey);
    
    // 更新消息并跟踪界面
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      const screenKey = `${ctx.from.id}_batch_operation_${operation}`;
      activeScreens.set(screenKey, {
        chatId: ctx.chat.id,
        messageId: ctx.callbackQuery.message.message_id,
        type: 'batch_operation'
      });
    }
  } catch (error) {
    console.error('显示批量操作界面时出错:', error);
    ctx.editMessageText('❌ 处理请求时出错，请稍后重试。', getRuleManagementKeyboard());
  }
};

// 执行批量操作
const performBatchOperation = async (ctx, selectedGroups, operation) => {
  try {
    // 使用按钮加载状态
    const buttonKey = startButtonLoading(ctx, `confirm_batch_operation_${operation}`);
    
    // 读取群组规则配置
    const groupRulesConfig = readGroupRulesConfig();
    let successCount = 0;
    
    // 对每个选中的群组执行操作
    selectedGroups.forEach((groupId) => {
      if (groupRulesConfig.group_specific_rules[groupId]) {
        // 更新群组规则状态
        groupRulesConfig.group_specific_rules[groupId].enabled = operation === 'enable';
        successCount++;
      }
    });
    
    // 保存配置
    const saved = saveGroupRulesConfig(groupRulesConfig);
    
    if (saved) {
      ctx.editMessageText(
        `✅ ${operation === 'enable' ? '批量启用' : '批量禁用'}成功！\n\n已${operation === 'enable' ? '启用' : '禁用'} ${successCount} 个群组的规则。\n\n`,
        getGroupRulesSettingsKeyboard()
      );
      
      // 清除会话中的选中状态
      if (ctx.session) {
        delete ctx.session.selectedGroups;
        delete ctx.session.currentBatchOperation;
      }
      
      // 刷新群组规则设置界面
      setTimeout(() => {
        showGroupRulesSettings(ctx);
      }, 1000);
    } else {
      ctx.editMessageText(
        `❌ ${operation === 'enable' ? '批量启用' : '批量禁用'}失败，请稍后重试。`,
        getGroupRulesSettingsKeyboard()
      );
    }
    
    // 结束按钮加载状态
    endButtonLoading(buttonKey);
  } catch (error) {
    console.error('执行批量操作时出错:', error);
    ctx.editMessageText('❌ 处理请求时出错，请稍后重试。', getRuleManagementKeyboard());
  }
};

// 导出群组配置
const exportGroupConfig = async (ctx) => {
  try {
    // 使用按钮加载状态
    const buttonKey = startButtonLoading(ctx, 'export_group_config');
    
    // 读取群组规则配置
    const groupRulesConfig = readGroupRulesConfig();
    
    // 将配置转换为JSON字符串
    const configJson = JSON.stringify(groupRulesConfig, null, 2);
    
    // 创建一个临时文件或使用缓冲区发送
    const buffer = Buffer.from(configJson, 'utf8');
    
    // 发送配置文件给用户
    await ctx.replyWithDocument({
      source: buffer,
      filename: `group_rules_config_${Date.now()}.json`
    }, {
      caption: '✅ 群组规则配置导出成功！\n\n此文件包含所有群组的规则配置信息。\n请妥善保管，并可通过导入功能恢复配置。'
    });
    
    // 结束按钮加载状态
    endButtonLoading(buttonKey);
    
    if (config.debugMode) {
      console.log(`[群组配置已导出] 由管理员 ${ctx.from.id} (${ctx.from.username || ctx.from.first_name}) 导出配置`);
    }
  } catch (error) {
    console.error('导出群组配置时出错:', error);
    ctx.answerCbQuery('❌ 导出配置时出错，请稍后重试', { show_alert: true });
    
    // 结束按钮加载状态
    endButtonLoading(buttonKey);
  }
};

// 处理测试规则回调
bot.action(/^test_rules:(.+)$/, async (ctx) => {
  try {
    // 检查管理员权限
    if (!await checkAdminPermission(ctx)) {
      return;
    }
    
    const groupId = ctx.match[1];
    
    // 记录用户的测试状态和当前群组ID
    ctx.session = ctx.session || {};
    ctx.session.expecting = 'test_rule_text';
    ctx.session.currentGroupId = groupId;
    
    // 回复用户，请求输入测试文本
    ctx.reply(`🧪 请输入要测试的文本（将应用群组 ${groupId} 的有效规则）：\n\n取消操作请发送 /cancel`);
  } catch (error) {
    console.error('处理测试规则回调时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
});

// 处理快速切换群组规则状态
const quickToggleGroupRules = async (ctx, groupId) => {
  try {
    // 使用按钮加载状态
    const buttonKey = startButtonLoading(ctx, `quick_toggle:${groupId}`);
    
    // 读取群组规则配置
    const groupRulesConfig = readGroupRulesConfig();
    
    // 检查群组是否存在
    if (!groupRulesConfig.group_specific_rules[groupId]) {
      ctx.answerCbQuery('❌ 群组不存在', { show_alert: true });
      endButtonLoading(buttonKey);
      return;
    }
    
    // 切换群组规则状态
    const currentState = groupRulesConfig.group_specific_rules[groupId].enabled || false;
    groupRulesConfig.group_specific_rules[groupId].enabled = !currentState;
    
    // 保存配置
    const saved = saveGroupRulesConfig(groupRulesConfig);
    
    if (saved) {
      ctx.answerCbQuery(`${!currentState ? '✅ 已启用' : '❌ 已禁用'}群组规则`, { show_alert: true });
    } else {
      ctx.answerCbQuery('❌ 保存配置时出错', { show_alert: true });
    }
    
    // 刷新群组规则设置界面
    setTimeout(() => {
      showGroupRulesSettings(ctx);
    }, 500);
    
    // 结束按钮加载状态
    endButtonLoading(buttonKey);
  } catch (error) {
    console.error('处理快速切换群组规则状态时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
};

// 处理快速切换继承全局规则
const quickToggleInheritGlobal = async (ctx, groupId) => {
  try {
    // 使用按钮加载状态
    const buttonKey = startButtonLoading(ctx, `quick_toggle_inherit:${groupId}`);
    
    // 读取群组规则配置
    const groupRulesConfig = readGroupRulesConfig();
    
    // 检查群组是否存在
    if (!groupRulesConfig.group_specific_rules[groupId]) {
      ctx.answerCbQuery('❌ 群组不存在', { show_alert: true });
      endButtonLoading(buttonKey);
      return;
    }
    
    // 切换继承全局规则状态
    const currentState = groupRulesConfig.group_specific_rules[groupId].inherit_global !== false; // 默认继承
    groupRulesConfig.group_specific_rules[groupId].inherit_global = !currentState;
    
    // 保存配置
    const saved = saveGroupRulesConfig(groupRulesConfig);
    
    if (saved) {
      ctx.answerCbQuery(`${!currentState ? '✅ 已启用' : '❌ 已禁用'}继承全局规则`, { show_alert: true });
    } else {
      ctx.answerCbQuery('❌ 保存配置时出错', { show_alert: true });
    }
    
    // 刷新群组规则设置界面
    setTimeout(() => {
      showGroupRulesSettings(ctx);
    }, 500);
    
    // 结束按钮加载状态
    endButtonLoading(buttonKey);
  } catch (error) {
    console.error('处理快速切换继承全局规则时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
};

// 处理快速查看生效规则
const quickViewEffectiveRules = async (ctx, groupId) => {
  try {
    // 使用按钮加载状态
    const buttonKey = startButtonLoading(ctx, `quick_view_effective:${groupId}`);
    
    // 调用已有的查看生效规则函数
    await handleViewEffectiveRules(ctx, groupId);
    
    // 结束按钮加载状态
    endButtonLoading(buttonKey);
  } catch (error) {
    console.error('处理快速查看生效规则时出错:', error);
    ctx.answerCbQuery('❌ 处理请求时出错，请稍后重试', { show_alert: true });
  }
};

// 处理查看所有生效规则
const viewAllEffectiveRules = async (ctx) => {
  try {
    // 使用按钮加载状态
    const buttonKey = startButtonLoading(ctx, 'view_all_effective_rules');
    
    // 读取群组规则配置
    const groupRulesConfig = readGroupRulesConfig();
    const configuredGroups = Object.keys(groupRulesConfig.group_specific_rules);
    
    // 构建所有生效规则消息
    let message = `🏠 主页 > ⚙️ 配置管理 > 📝 替换规则 > 👥 群组规则设置 > 📋 所有群组生效规则概览\n\n`;
    
    if (configuredGroups.length === 0) {
      message += `📝 当前没有为任何群组配置特定规则。`;
    } else {
      // 获取每个群组的生效规则数量
      for (const groupId of configuredGroups) {
        const effectiveRuleCount = await getEffectiveRuleCount(groupId);
        const groupSettings = groupRulesConfig.group_specific_rules[groupId];
        const isEnabled = groupSettings.enabled || false;
        
        message += `🔹 群组 ${groupId}: ${isEnabled ? '✅ 启用' : '❌ 禁用'}\n`;
        message += `   • 生效规则数量: ${effectiveRuleCount}\n\n`;
      }
      
      message += `💡 提示：点击群组旁边的 "查看生效规则" 按钮可查看每个群组的具体生效规则。`;
    }
    
    // 更新消息
    ctx.editMessageText(message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔙 返回群组规则设置', callback_data: 'group_rules_settings' }
          ]
        ]
      }
    });
    
    // 结束按钮加载状态
    endButtonLoading(buttonKey);
    
    // 更新消息并跟踪界面
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      const screenKey = `${ctx.from.id}_all_effective_rules`;
      activeScreens.set(screenKey, {
        chatId: ctx.chat.id,
        messageId: ctx.callbackQuery.message.message_id,
        type: 'group_rules_settings'
      });
    }
  } catch (error) {
    console.error('处理查看所有生效规则时出错:', error);
    ctx.editMessageText('❌ 处理请求时出错，请稍后重试。', getRuleManagementKeyboard());
  }
};