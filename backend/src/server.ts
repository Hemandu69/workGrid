import { buildApp } from './app.js';
import { config } from './config/index.js';
import { prisma } from './db/client.js';
import { closeRedisConnection } from './redis/client.js';
import { BloomFilterService } from './services/bloom-filter.service.js';

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

    // Fire-and-forget — the email-availability Bloom filter falls through to
    // Postgres on every check until this completes, so it's never a
    // correctness dependency, just a startup-time cache warm-up.
    BloomFilterService.backfill().catch((err) => app.log.warn(err, 'Bloom filter backfill failed (non-fatal)'));
  } catch (err) {
    app.log.error(err, 'Failed to start server');
    process.exit(1);
  }
}

startServer();
