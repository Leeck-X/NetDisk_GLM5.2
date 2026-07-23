/**
 * PM2 进程守护配置
 * 用法：
 *   npm install -g pm2
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup   （生成开机自启脚本）
 *
 * 然后访问 http://localhost:3000
 */
module.exports = {
  apps: [
    {
      name: 'webftp',
      script: 'api/server.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx/esm',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      out_file: './logs/webftp-out.log',
      error_file: './logs/webftp-error.log',
      merge_logs: true,
      time: true,
    },
  ],
}
