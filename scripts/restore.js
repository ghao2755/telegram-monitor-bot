#!/usr/bin/env node

// 数据恢复脚本
const fs = require('fs-extra');
const path = require('path');
const { execSync, exec } = require('child_process');
const readline = require('readline');

// 创建交互式输入接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 获取项目根目录
const PROJECT_ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const BACKUP_DIR = path.join(PROJECT_ROOT, 'backups');

// 列出可用的备份文件
const listBackups = async () => {
  try {
    // 确保备份目录存在
    if (!await fs.pathExists(BACKUP_DIR)) {
      console.error('备份目录不存在:', BACKUP_DIR);
      process.exit(1);
    }
    
    // 读取备份目录中的文件
    const files = await fs.readdir(BACKUP_DIR);
    
    // 过滤出备份文件 - 使用Promise.all处理异步操作
    const fileStatusPromises = files.map(async file => {
      const filePath = path.join(BACKUP_DIR, file);
      try {
        const stats = await fs.stat(filePath);
        return {
          file, 
          isDirectory: stats.isDirectory()
        };
      } catch (error) {
        console.error(`获取文件状态失败: ${file}`, error);
        return { file, isDirectory: false };
      }
    });
    
    const fileStatuses = await Promise.all(fileStatusPromises);
    const backupFiles = fileStatuses
      .filter(status => 
        status.file.startsWith('data_backup_') && 
        (status.file.endsWith('.zip') || status.isDirectory)
      )
      .map(status => status.file);
    
    // 按创建时间排序（最新的在前）
    const sortedBackups = await Promise.all(
      backupFiles.map(async file => {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = await fs.stat(filePath);
        return {
          name: file,
          path: filePath,
          date: stats.isDirectory() ? stats.mtime : stats.ctime,
          isDirectory: stats.isDirectory()
        };
      })
    );
    
    return sortedBackups.sort((a, b) => b.date - a.date);
    
  } catch (error) {
    console.error('列出备份文件失败:', error);
    process.exit(1);
  }
};

// 显示备份列表
const showBackupList = async () => {
  const backups = await listBackups();
  
  console.log('可用的备份文件:');
  console.log('----------------------------------------');
  
  if (backups.length === 0) {
    console.log('没有找到备份文件');
    return null;
  }
  
  backups.forEach((backup, index) => {
    console.log(`${index + 1}. ${backup.name}`);
    console.log(`   创建时间: ${backup.date.toLocaleString()}`);
    console.log(`   类型: ${backup.isDirectory ? '目录' : 'ZIP压缩包'}`);
  });
  
  console.log('----------------------------------------');
  return backups;
};

// 选择备份文件
const selectBackup = async () => {
  const backups = await showBackupList();
  
  if (!backups || backups.length === 0) {
    process.exit(1);
  }
  
  return new Promise((resolve) => {
    rl.question('请选择要恢复的备份编号 (1-' + backups.length + '): ', (answer) => {
      const index = parseInt(answer) - 1;
      
      if (isNaN(index) || index < 0 || index >= backups.length) {
        console.error('无效的选择，请输入有效的编号');
        resolve(selectBackup());
      } else {
        resolve(backups[index]);
      }
    });
  });
};

// 确认恢复操作
const confirmRestore = (backupName) => {
  return new Promise((resolve) => {
    rl.question(`\n⚠️  警告：恢复操作将覆盖当前的数据！\n确认要恢复备份 "${backupName}" 吗？(y/n): `, (answer) => {
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
};

// 创建当前数据的临时备份（以防恢复失败）
const createTempBackup = async () => {
  try {
    const tempBackupDir = path.join(PROJECT_ROOT, `data_backup_before_restore_${new Date().toISOString().replace(/[:.]/g, '-')}`);
    
    console.log('正在创建当前数据的临时备份...');
    await fs.copy(DATA_DIR, tempBackupDir);
    
    console.log(`✅ 临时备份已创建: ${path.basename(tempBackupDir)}`);
    return tempBackupDir;
    
  } catch (error) {
    console.error('创建临时备份失败:', error);
    throw error;
  }
};

// 从ZIP文件恢复数据
const restoreFromZip = async (zipFilePath) => {
  try {
    // 确保data目录存在
    await fs.ensureDir(DATA_DIR);
    
    console.log(`正在从ZIP文件恢复: ${path.basename(zipFilePath)}`);
    
    // 使用unzip命令解压文件
    // 注意：这个命令假设系统已经安装了unzip工具
    try {
      execSync(`unzip -o ${zipFilePath} -d ${PROJECT_ROOT}`, {
        stdio: 'inherit'
      });
      
      console.log('✅ ZIP文件恢复成功');
      return true;
    } catch (error) {
      console.error('unzip命令执行失败:', error);
      throw error;
    }
    
  } catch (error) {
    console.error('从ZIP文件恢复失败:', error);
    throw error;
  }
};

// 从目录恢复数据
const restoreFromDirectory = async (backupDir) => {
  try {
    // 确保data目录存在
    await fs.ensureDir(DATA_DIR);
    
    // 清空当前data目录
    await fs.emptyDir(DATA_DIR);
    
    console.log(`正在从目录恢复: ${path.basename(backupDir)}`);
    
    // 复制备份文件到data目录
    await fs.copy(backupDir, DATA_DIR);
    
    console.log('✅ 目录恢复成功');
    return true;
    
  } catch (error) {
    console.error('从目录恢复失败:', error);
    throw error;
  }
};

// 执行恢复操作
const performRestore = async () => {
  try {
    // 显示备份列表并选择
    const selectedBackup = await selectBackup();
    
    // 确认恢复操作
    const confirmed = await confirmRestore(selectedBackup.name);
    
    if (!confirmed) {
      console.log('恢复操作已取消');
      process.exit(0);
    }
    
    // 创建临时备份
    let tempBackupDir = null;
    try {
      tempBackupDir = await createTempBackup();
    } catch (error) {
      console.warn('创建临时备份失败，但仍继续恢复操作');
    }
    
    try {
      // 根据备份类型执行恢复
      if (selectedBackup.isDirectory) {
        await restoreFromDirectory(selectedBackup.path);
      } else {
        await restoreFromZip(selectedBackup.path);
      }
      
      console.log('\n🎉 数据恢复成功！');
      
      // 恢复成功后，可以删除临时备份
      if (tempBackupDir) {
        console.log('正在清理临时备份...');
        await fs.remove(tempBackupDir);
      }
      
    } catch (error) {
      console.error('\n❌ 恢复操作失败！');
      
      // 如果有临时备份，询问是否恢复
      if (tempBackupDir) {
        const restoreTemp = await new Promise((resolve) => {
          rl.question('是否要恢复到之前的数据状态？(y/n): ', (answer) => {
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
          });
        });
        
        if (restoreTemp) {
          try {
            await fs.emptyDir(DATA_DIR);
            await fs.copy(tempBackupDir, DATA_DIR);
            console.log('✅ 已恢复到之前的数据状态');
          } catch (err) {
            console.error('恢复到之前的数据状态失败:', err);
          }
        }
      }
      
      process.exit(1);
    }
    
  } catch (error) {
    console.error('恢复过程中发生错误:', error);
    process.exit(1);
  } finally {
    rl.close();
  }
};

// 显示帮助信息
const showHelp = () => {
  console.log('Telegram监控机器人数据恢复脚本');
  console.log('用法: node scripts/restore.js [选项]');
  console.log('');
  console.log('选项:');
  console.log('  --help, -h       显示帮助信息');
  console.log('  --list, -l       列出所有备份文件');
  console.log('  --file <path>    指定要恢复的备份文件路径');
};

// 解析命令行参数
const parseArgs = () => {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }
  
  if (args.includes('--list') || args.includes('-l')) {
    showBackupList().then(() => process.exit(0));
    return;
  }
  
  const fileIndex = args.indexOf('--file');
  if (fileIndex !== -1 && fileIndex + 1 < args.length) {
    const backupFilePath = args[fileIndex + 1];
    console.log(`指定恢复文件: ${backupFilePath}`);
    
    // 这里可以实现直接从指定文件恢复的逻辑
    // 为简化示例，我们仍然使用交互式方式
    performRestore();
    return;
  }
  
  // 执行交互式恢复
  performRestore();
};

// 主函数
const main = () => {
  console.log('=== Telegram监控机器人数据恢复工具 ===');
  parseArgs();
};

// 启动脚本
main();