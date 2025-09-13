import { Router } from 'express';
import { shopifyService } from '../services/shopify.js';
import { logger } from '../config/logger.js';
import { prisma } from '../services/prisma.js';
import { queue } from '../services/queue.js';
import { processWebhook } from '../services/webhookProcessor.js';
import { env } from '../config/env.js';
import crypto from 'crypto';

export const webhooksRouter = Router();

// Helper to safely parse raw JSON
function safeJsonParse(buf: Buffer): any {
  try { return JSON.parse(buf.toString('utf8')); } catch { return null; }
}

webhooksRouter.post('/shopify', async (req, res) => {
  // Normalize headers case-insensitively
  const headers = Object.keys(req.headers).reduce<Record<string,string>>((acc,k)=>{ const v=req.headers[k]; if(typeof v==='string') acc[k.toLowerCase()] = v; return acc; }, {});
  const topic = headers['x-shopify-topic'];
  const shopDomain = headers['x-shopify-shop-domain'];
  const hmac = headers['x-shopify-hmac-sha256'];
  const eventId = headers['x-shopify-event-id'];
  const triggeredAtHeader = headers['x-shopify-triggered-at'];
  const rawBuf: Buffer = req.body as any as Buffer;
  const rawBody = Buffer.isBuffer(rawBuf) ? rawBuf.toString('utf8') : '';

  if (!env.WEBHOOK_SKIP_HMAC && (!hmac || !shopifyService.verifyWebhook(rawBody, hmac))) {
    const hash = crypto.createHash('sha256').update(rawBody).digest('hex').slice(0,32);
    logger.warn({ hash, topic, shopDomain }, 'Invalid webhook HMAC');
    return res.status(401).send('Invalid HMAC');
  }
  if (env.WEBHOOK_SKIP_HMAC && !hmac) {
    logger.warn({ topic, shopDomain }, 'HMAC skipped (dev mode)');
  }
  if (!topic || !shopDomain) return res.status(400).send('Missing topic or shop domain');
  if (!eventId) logger.warn({ topic, shopDomain }, 'Missing event id (cannot dedupe)');

  const shop = await prisma.shopifyShop.findUnique({ where: { shopDomain } });
  if (!shop) {
    logger.warn({ shopDomain }, 'Webhook for unknown shop');
    return res.status(202).send('Ignored');
  }

  // Dedupe (best-effort) using eventId
  if (eventId) {
    const prismaAny: any = prisma as any;
    const existingEvent = await prismaAny.webhookEvent.findUnique({ where: { eventId } });
    if (existingEvent) {
      logger.info({ eventId, topic }, 'Duplicate webhook ignored');
      return res.status(200).send('OK');
    }
    // Persist event record (store raw body hash only for privacy)
    const rawBodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    let triggeredAt: Date | undefined = undefined;
    if (triggeredAtHeader) {
      const t = new Date(triggeredAtHeader);
      if (!isNaN(t.getTime())) triggeredAt = t;
    }
    await prismaAny.webhookEvent.create({ data: { eventId, topic, shopDomain, rawBodyHash, triggeredAt } });
  }

  const payload = safeJsonParse(Buffer.from(rawBody));
  if (!payload) return res.status(400).send('Invalid JSON');

  try {
    if (env.QUEUE_DRIVER === 'redis') {
      await queue.add('webhook.process', { type: 'webhook.process', topic, shopDomain, rawBody, headers });
      logger.info({ topic, shopDomain }, 'Webhook enqueued');
      return res.status(202).send('Enqueued');
    } else {
      await processWebhook({ topic, shopDomain, rawBody, headers });
      return res.status(200).send('OK');
    }
  } catch (e:any) {
    logger.error({ topic, err: e }, 'Webhook enqueue/processing failed');
    return res.status(500).send('Error');
  }
});
