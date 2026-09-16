import { createApp } from './app.js';
import { config } from './config.js';
import { checkDependencies } from './services/ffmpegService.js';
import { startProxy } from './services/proxyService.js';
import { setProxy } from './services/videoService.js';
import { cleanupOldFiles } from './services/cleanupService.js';
import { jobs, expireJobs, restoreCompletedJobs } from './services/downloadService.js';
import { children, killTree } from './services/processService.js';
try {
  const versions = await checkDependencies();
  await restoreCompletedJobs();
  await cleanupOldFiles(new Set(jobs.keys()));
  const proxy = await startProxy();
  setProxy(proxy.url);
  const app = createApp(versions);
  const server = app.listen(config.port, config.host, () =>
    console.log(`Social Video Downloader: http://${config.host}:${config.port}`),
  );
  server.requestTimeout = 0;
  server.on('error', (error) => {
    console.error(error.message);
    proxy.close();
    process.exit(1);
  });
  let cleaning = false;
  const cleanup = setInterval(async () => {
    if (cleaning) return;
    cleaning = true;
    try {
      await expireJobs();
      await cleanupOldFiles(new Set(jobs.keys()));
    } catch (error) {
      console.error('Cleanup:', error.message);
    } finally {
      cleaning = false;
    }
  }, 60000);
  cleanup.unref();
  const shutdown = () => {
    clearInterval(cleanup);
    for (const child of children) killTree(child);
    proxy.close();
    server.close();
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
