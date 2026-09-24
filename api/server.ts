/**
 * local server entry file, for local development
 */
import app from './app.js';
import { runGc } from './gc.js';

/**
 * start server with port
 */
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`Server ready on http://${HOST}:${PORT}`);
});

/**
 * 周期性垃圾清理：启动后先跑一轮，之后每小时一次。
 * 放在这里而不是 app.ts —— app.ts 会被 api/index.ts（Vercel serverless）
 * 复用，serverless 环境下长驻定时器没有意义且会阻止实例回收。
 */
const GC_INTERVAL_MS = Number(process.env.GC_INTERVAL_MINUTES ?? 60) * 60 * 1000;

setTimeout(() => {
  try {
    runGc();
  } catch (err) {
    console.error('[WebFtp] 启动清理任务执行失败', err);
  }
}, 10 * 1000).unref();

const gcTimer = setInterval(() => {
  try {
    runGc();
  } catch (err) {
    console.error('[WebFtp] 定时清理任务执行失败', err);
  }
}, GC_INTERVAL_MS);
gcTimer.unref();

/**
 * close server
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  clearInterval(gcTimer);
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  clearInterval(gcTimer);
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;