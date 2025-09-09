module.exports = {
  apps: [{
    name: 'telegram-bot',
    script: 'index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    env_production: {
      NODE_ENV: 'production'
    },
    // 添加日志配置
    log_file: 'logs/combined.log',
    out_file: 'logs/out.log',
    error_file: 'logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // 高级重启策略
    exp_backoff_restart_delay: 100,
    max_restarts: 10,
    restart_delay: 4000
  }]
};