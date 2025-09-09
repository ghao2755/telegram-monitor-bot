// 导入Markup模块
const { Markup } = require('telegraf');

// 获取主控制面板键盘
const getMainKeyboard = () => {
  return [
    [Markup.button.callback('📋 状态仪表板', 'menu:dashboard')],
    [Markup.button.callback('🎯 群组管理', 'menu:groups')],
    [Markup.button.callback('📝 规则管理', 'menu:rules')],
    [Markup.button.callback('📌 置顶管理', 'menu:pinning')],
    [Markup.button.callback('🔍 系统自检', 'menu:diagnostics')],
    [Markup.button.callback('⚙️ 设置', 'menu:settings')]
  ];
};

// 获取群组管理界面键盘
const getGroupsKeyboard = () => {
  return [
    [Markup.button.callback('➕ 添加监控群组', 'action:group:add_source')],
    [Markup.button.callback('🎯 设置目标群组', 'action:group:set_target')],
    [Markup.button.callback('📋 群组列表', 'action:group:list')],
    [Markup.button.callback('⚙️ 配置群组规则', 'action:group:config_rules')],
    [Markup.button.callback('🔙 返回主菜单', 'menu:main')]
  ];
};

// 获取规则管理界面键盘
const getRulesKeyboard = () => {
  return [
    [Markup.button.callback('🌐 添加全局规则', 'action:rule:add_global')],
    [Markup.button.callback('🎯 管理群组规则', 'action:rule:manage_group')],
    [Markup.button.callback('🧪 规则测试', 'action:rule:test')],
    [Markup.button.callback('📤 导入/导出', 'action:rule:import_export')],
    [Markup.button.callback('🔙 返回主菜单', 'menu:main')]
  ];
};

// 获取置顶管理界面键盘
const getPinningKeyboard = () => {
  return [
    [Markup.button.callback('✅ 启用/禁用置顶', 'action:pin:toggle')],
    [Markup.button.callback('🎯 配置置顶群组', 'action:pin:config_groups')],
    [Markup.button.callback('📋 置顶状态', 'action:pin:status')],
    [Markup.button.callback('🔙 返回主菜单', 'menu:main')]
  ];
};

// 获取状态仪表板键盘
const getDashboardKeyboard = () => {
  return [
    [Markup.button.callback('🔄 刷新状态', 'action:dashboard:refresh')],
    [Markup.button.callback('📊 详细统计', 'action:dashboard:stats')],
    [Markup.button.callback('🔙 返回主菜单', 'menu:main')]
  ];
};

// 获取系统自检界面键盘
const getDiagnosticsKeyboard = () => {
  return [
    [Markup.button.callback('🔍 运行自检', 'action:diagnostics:run')],
    [Markup.button.callback('🛠️ 自动修复', 'action:diagnostics:repair')],
    [Markup.button.callback('📋 自检报告', 'action:diagnostics:report')],
    [Markup.button.callback('🔙 返回主菜单', 'menu:main')]
  ];
};

// 获取设置界面键盘
const getSettingsKeyboard = () => {
  return [
    [Markup.button.callback('⏱️ 设置检查间隔', 'action:settings:interval')],
    [Markup.button.callback('👥 管理管理员', 'action:settings:admins')],
    [Markup.button.callback('💾 备份设置', 'action:settings:backup')],
    [Markup.button.callback('🔙 返回主菜单', 'menu:main')]
  ];
};

// 获取群组列表键盘（动态生成）
const getGroupListKeyboard = (groups, isSource = true) => {
  const keyboard = [];
  const groupType = isSource ? 'sources' : 'targets';
  
  if (groups[groupType] && groups[groupType].length > 0) {
    groups[groupType].forEach(group => {
      const status = group.enabled ? '✅' : '❌';
      keyboard.push([
        Markup.button.callback(
          `${status} ${group.name || `群组${group.id}`}`, 
          `action:group:toggle:${group.id}`
        )
      ]);
    });
  } else {
    keyboard.push([Markup.button.callback('暂无群组', 'action:noop')]);
  }
  
  keyboard.push([Markup.button.callback('🔙 返回', 'menu:groups')]);
  
  return keyboard;
};

// 获取规则列表键盘（动态生成）
const getRuleListKeyboard = (rules, type = 'global') => {
  const keyboard = [];
  
  if (type === 'global' && Object.keys(rules.global).length > 0) {
    Object.entries(rules.global).forEach(([keyword, replacement]) => {
      keyboard.push([
        Markup.button.callback(
          `${keyword} → ${replacement}`, 
          `action:rule:delete_global:${encodeURIComponent(keyword)}`
        )
      ]);
    });
  } else if (type === 'group' && Object.keys(rules.groupSpecific).length > 0) {
    Object.entries(rules.groupSpecific).forEach(([groupId, groupRules]) => {
      keyboard.push([
        Markup.button.callback(
          `${groupId} (${groupRules.enabled ? '启用' : '禁用'})`, 
          `action:rule:view_group:${groupId}`
        )
      ]);
    });
  } else {
    keyboard.push([Markup.button.callback('暂无规则', 'action:noop')]);
  }
  
  keyboard.push([Markup.button.callback('🔙 返回', 'menu:rules')]);
  
  return keyboard;
};

// 获取确认对话框键盘
const getConfirmKeyboard = (action, params = '') => {
  return [
    [
      Markup.button.callback('✅ 确认', `action:confirm:${action}:${params}`),
      Markup.button.callback('❌ 取消', 'action:cancel')
    ]
  ];
};

// 获取返回按钮键盘
const getBackKeyboard = (targetMenu = 'main') => {
  return [
    [Markup.button.callback('🔙 返回', `menu:${targetMenu}`)]
  ];
};

// 获取加载状态键盘
const getLoadingKeyboard = () => {
  return [
    [Markup.button.callback('⏳ 处理中...', 'action:loading')]
  ];
};

// 导出所有函数
module.exports = {
  getMainKeyboard,
  getGroupsKeyboard,
  getRulesKeyboard,
  getPinningKeyboard,
  getDashboardKeyboard,
  getDiagnosticsKeyboard,
  getSettingsKeyboard,
  getGroupListKeyboard,
  getRuleListKeyboard,
  getConfirmKeyboard,
  getBackKeyboard,
  getLoadingKeyboard
};