// 创建高级日志系统模块
const fs = require('fs-extra');
const path = require('path');

class Logger {
  constructor() {
    this.logsDir = path.join(__dirname, '..', 'logs');
    this.appLogFile = path.join(this.logsDir, 'app.log');
    this.errorLogFile = path.join(this.logsDir, 'errors.log');
    this.maxLogSize = 10485760; // 10MB
    this.backups = 3;
    
    // 确保日志目录存在
    fs.ensureDirSync(this.logsDir);
    
    // 日志级别
    this.levels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3
    };
    
    this.currentLevel = this.levels.INFO;
  }
  
  // 格式化时间戳
  formatTimestamp() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').replace('Z', '');
  }
  
  // 检查日志文件大小并滚动
  checkAndRollLogFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.size >= this.maxLogSize) {
          // 滚动日志文件
          for (let i = this.backups - 1; i > 0; i--) {
            const oldBackup = `${filePath}.${i}`;
            const newBackup = `${filePath}.${i + 1}`;
            if (fs.existsSync(oldBackup)) {
              fs.renameSync(oldBackup, newBackup);
            }
          }
          // 重命名当前日志文件为第一个备份
          fs.renameSync(filePath, `${filePath}.1`);
        }
      }
    } catch (error) {
      console.error('滚动日志文件失败:', error);
    }
  }
  
  // 写入日志到文件
  writeToLog(filePath, message) {
    try {
      this.checkAndRollLogFile(filePath);
      fs.appendFileSync(filePath, message + '\n');
    } catch (error) {
      console.error('写入日志文件失败:', error);
    }
  }
  
  // 通用日志方法
  log(level, message) {
    const timestamp = this.formatTimestamp();
    const formattedMessage = `[${timestamp}] [${level}] ${message}`;
    
    // 根据日志级别输出到控制台
    if (level === 'ERROR' || level === 'WARN') {
      console.error(formattedMessage);
    } else {
      console.log(formattedMessage);
    }
    
    // 写入到应用日志文件
    this.writeToLog(this.appLogFile, formattedMessage);
    
    // 如果是错误日志，额外写入到错误日志文件
    if (level === 'ERROR') {
      this.writeToLog(this.errorLogFile, formattedMessage);
    }
  }
  
  // 各级别日志方法
  debug(message) {
    if (this.currentLevel <= this.levels.DEBUG) {
      this.log('DEBUG', message);
    }
  }
  
  info(message) {
    if (this.currentLevel <= this.levels.INFO) {
      this.log('INFO', message);
    }
  }
  
  warn(message) {
    if (this.currentLevel <= this.levels.WARN) {
      this.log('WARN', message);
    }
  }
  
  error(message) {
    this.log('ERROR', message);
  }
  
  // 设置日志级别
  setLevel(level) {
    if (this.levels[level]) {
      this.currentLevel = this.levels[level];
      this.info(`日志级别已设置为: ${level}`);
    }
  }
}

// 创建并导出全局日志实例
const logger = new Logger();
module.exports = logger;