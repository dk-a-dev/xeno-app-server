import cron from 'node-cron';
import { env } from '../config/env.js';
import { prisma } from './prisma.js';
import { shopifyService } from './shopify.js';
import { logger } from '../config/logger.js';

export function startScheduler() {
  cron.schedule(env.SYNC_INTERVAL_CRON, async () => {
    try {
      const shops = await prisma.shopifyShop.findMany({ where: { installState: 'active' } });
      for (const shop of shops) {
        await shopifyService.fullSync(shop.tenantId);
      }
      logger.info({ count: shops.length }, 'Scheduled sync completed');
    } catch (e: any) {
      logger.error({ err: e }, 'Scheduled sync failed');
    }
  });
  logger.info({ cron: env.SYNC_INTERVAL_CRON }, 'Scheduler started');
}
