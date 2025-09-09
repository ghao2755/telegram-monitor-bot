#!/usr/bin/env node

// 数据备份脚本
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

// 获取项目根目录
const PROJECT_ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const BACKUP_DIR = path.join(PROJECT_ROOT, 'backups');

// 确保备份目录存在
const ensureBackupDir = async () => {
  try {
    await fs.ensureDir(BACKUP_DIR);
    console.log(`备份目录: ${BACKUP_DIR}`);
  } catch (error) {
    console.error('创建备份目录失败:', error);
    process.exit(1);
  }
};

// 生成备份文件名
const generateBackupFileName = () => {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return `data_backup_${timestamp}.zip`;
};

// 执行备份操作
const performBackup = async () => {
  try {
    // 确保备份目录存在
    await ensureBackupDir();
    
    // 生成备份文件名
    const backupFileName = generateBackupFileName();
    const backupFilePath = path.join(BACKUP_DIR, backupFileName);
    
    console.log('开始备份数据...');
    
    // 使用zip命令压缩data目录
    // 注意：这个命令假设系统已经安装了zip工具
    try {
      execSync(`zip -r ${backupFilePath} ${DATA_DIR}`, {
        stdio: 'inherit',
        cwd: PROJECT_ROOT
      });
      
      console.log(`✅ 备份成功: ${backupFileName}`);
      console.log(`备份文件大小: ${(fs.statSync(backupFilePath).size / 1024).toFixed(2)} KB`);
    } catch (error) {
      // 如果zip命令失败，使用fs-extra复制文件
      console.log('zip命令执行失败，使用简单复制方式备份...');
      
      const simpleBackupDir = path.join(BACKUP_DIR, `data_backup_${new Date().toISOString().replace(/[:.]/g, '-')}`);
      await fs.copy(DATA_DIR, simpleBackupDir);
      
      console.log(`✅ 备份成功（简单复制）: ${path.basename(simpleBackupDir)}`);
    }
    
    // 清理旧备份（保留最近7天的备份）
    await cleanupOldBackups();
    
  } catch (error) {
    console.error('备份失败:', error);
    process.exit(1);
  }
};

// 清理旧备份
const cleanupOldBackups = async () => {
  try {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    
    // 读取备份目录中的所有文件
    const backupFiles = await fs.readdir(BACKUP_DIR);
    
    let deletedCount = 0;
    
    for (const file of backupFiles) {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = await fs.stat(filePath);
      
      // 如果是目录，检查修改时间
      if (stats.isDirectory()) {
        if (stats.mtime.getTime() < sevenDaysAgo) {
          await fs.remove(filePath);
          deletedCount++;
        }
      }
      // 如果是zip文件，检查创建时间
      else if (file.endsWith('.zip')) {
        if (stats.ctime.getTime() < sevenDaysAgo) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }
    }
    
    if (deletedCount > 0) {
      console.log(`已清理 ${deletedCount} 个过期备份文件`);
    }
    
  } catch (error) {
    console.error('清理旧备份失败:', error);
    // 这个错误不影响主流程
  }
};

// 显示帮助信息
const showHelp = () => {
  console.log('Telegram监控机器人数据备份脚本');
  console.log('用法: node scripts/backup.js [选项]');
  console.log('');
  console.log('选项:');
  console.log('  --help, -h       显示帮助信息');
  console.log('  --force, -f      强制备份（覆盖现有备份）');
  console.log('  --cleanup        只清理旧备份，不执行新的备份');
};

// 解析命令行参数
const parseArgs = () => {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }
  
  if (args.includes('--cleanup')) {
    cleanupOldBackups().then(() => process.exit(0));
    return;
  }
  
  // 执行正常备份
  performBackup();
};

// 主函数
const main = () => {
  console.log('=== Telegram监控机器人数据备份工具 ===');
  parseArgs();
};

// 启动脚本
main();