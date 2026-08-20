import { buildApp } from './app.js';
import { config } from './config/index.js';
import { prisma } from './db/client.js';
import { closeRedisConnection } from './redis/client.js';

async function startServer() {
  const app = await buildApp();

  // Graceful shutdown handling
  const closeSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of closeSignals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, starting graceful shutdown...`);
      try {
        await app.close();
        await prisma.$disconnect();
        await closeRedisConnection();
        app.log.info('Clean shutdown completed.');
        process.exit(0);
      } catch (err) {
        app.log.error(err, 'Error during shutdown');
        process.exit(1);
      }
    });
  }

  try {
    const address = await app.listen({
      port: config.PORT,
      host: config.HOST,
    });
    app.log.info(`🚀 Backend server listening on ${address}`);
  } catch (err) {
    app.log.error(err, 'Failed to start server');
    process.exit(1);
  }
}

startServer();
