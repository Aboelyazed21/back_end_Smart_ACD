import { createServer, Server } from 'node:http';
import { createApp } from './app';
import { closePool, one } from './config/db';
import { env } from './config/env';
import { logger } from './config/logger';

let server: Server | undefined;
let shuttingDown = false;

async function start(): Promise<void> {
  const app = createApp();

  // Fail fast on an unreachable database rather than accepting traffic.
  try {
    await one('SELECT 1 AS ok');
  } catch (error) {
    logger.error({ err: error }, 'database is not reachable at startup');
    throw error;
  }

  server = createServer(app);
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  server.requestTimeout = 30_000;

  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(env.PORT, () => {
      server!.off('error', reject);
      resolve();
    });
  });

  logger.info({ port: env.PORT, environment: env.NODE_ENV }, 'Smart Academic Advisor API listening');
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'graceful shutdown started');

  const forceExit = setTimeout(() => {
    logger.error('graceful shutdown timed out; forcing exit');
    process.exit(1);
  }, 15_000);
  forceExit.unref();

  if (server) {
    await new Promise<void>((resolve) => {
      server!.close(() => resolve());
      // Stop accepting new keep-alive connections.
      server!.closeIdleConnections?.();
    });
  }
  try {
    await closePool();
  } catch (error) {
    logger.error({ err: error }, 'error closing database pool');
  }
  logger.info('graceful shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled promise rejection');
});
process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'uncaught exception');
  void shutdown('uncaughtException');
});

start().catch((error) => {
  logger.error({ err: error }, 'failed to start API');
  process.exit(1);
});
