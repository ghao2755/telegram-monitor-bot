module.exports = {
  apps: [
    {
      name: 'telegram-forwarder-bot',
      script: 'src/index.js',
      watch: false,
      autorestart: true,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production'
      },
      env_development: {
        NODE_ENV: 'development'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      combine_logs: true,
      max_memory_restart: '256M'
    }
  ]
};