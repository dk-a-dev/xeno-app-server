import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { queue } from './services/queue.js';
import { processWebhook } from './services/webhookProcessor.js';

async function main() {
  if (env.QUEUE_DRIVER !== 'redis') {
    logger.warn('QUEUE_DRIVER is not redis; worker exiting (memory mode processes inline).');
    return;
  }
  queue.process(async (job) => {
    if (job.type === 'webhook.process') {
      await processWebhook({ topic: job.topic, shopDomain: job.shopDomain, rawBody: job.rawBody, headers: job.headers });
    } else {
      logger.warn({ type: job.type }, 'Unknown job type');
    }
  });
  logger.info('Ingestion worker started (redis queue)');
}

main().catch(e => { logger.error({ err: e }, 'Worker failed to start'); process.exit(1); });
