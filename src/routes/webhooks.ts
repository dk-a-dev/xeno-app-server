import { Router } from 'express';
import { shopifyService } from '../services/shopify.js';
import { logger } from '../config/logger.js';
import { prisma } from '../services/prisma.js';
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

  if (!hmac || !shopifyService.verifyWebhook(rawBody, hmac)) {
    const hash = crypto.createHash('sha256').update(rawBody).digest('hex').slice(0,32);
    logger.warn({ hash, topic, shopDomain }, 'Invalid webhook HMAC');
    return res.status(401).send('Invalid HMAC');
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
    const existingEvent = await prisma.webhookEvent.findUnique({ where: { eventId } });
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
    await prisma.webhookEvent.create({ data: { eventId, topic, shopDomain, rawBodyHash, triggeredAt } });
  }

  const payload = safeJsonParse(Buffer.from(rawBody));
  if (!payload) return res.status(400).send('Invalid JSON');

  try {
    switch (topic) {
      case 'customers/create':
      case 'customers/update': {
        const c = payload; // Shopify customer object
        await prisma.customer.upsert({
          where: { shopifyId: String(c.id) },
          update: { email: c.email, firstName: c.first_name, lastName: c.last_name },
          create: { tenantId: shop.tenantId, shopifyId: String(c.id), email: c.email, firstName: c.first_name, lastName: c.last_name }
        });
        break;
      }
      case 'products/create':
      case 'products/update': {
        const p = payload; // Shopify product
        await prisma.product.upsert({
          where: { shopifyId: String(p.id) },
          update: { title: p.title },
          create: { tenantId: shop.tenantId, shopifyId: String(p.id), title: p.title || 'Untitled' }
        });
        break;
      }
      case 'orders/create':
      case 'orders/updated':
      case 'orders/paid': {
        const o = payload; // Shopify order
        // Ensure customer (if present) exists first
        let customerId: string | undefined = undefined;
        if (o.customer && o.customer.id) {
          const cust = await prisma.customer.upsert({
            where: { shopifyId: String(o.customer.id) },
            update: { email: o.customer.email, firstName: o.customer.first_name, lastName: o.customer.last_name },
            create: { tenantId: shop.tenantId, shopifyId: String(o.customer.id), email: o.customer.email, firstName: o.customer.first_name, lastName: o.customer.last_name }
          });
          customerId = cust.id;
        }
        const existing = await prisma.order.findUnique({ where: { shopifyId: String(o.id) } });
        let orderId: string;
        if (!existing) {
          const created = await prisma.order.create({
            data: {
              tenantId: shop.tenantId,
              shopifyId: String(o.id),
              customerId,
              totalPrice: o.total_price ? parseFloat(o.total_price) : 0,
              orderDate: new Date(o.created_at || o.processed_at || triggeredAtHeader || Date.now())
            }
          });
          orderId = created.id;
        } else {
          const updated = await prisma.order.update({
            where: { id: existing.id },
            data: {
              customerId,
              totalPrice: o.total_price ? parseFloat(o.total_price) : 0,
              orderDate: new Date(o.created_at || o.processed_at || triggeredAtHeader || Date.now())
            }
          });
          orderId = updated.id;
          await prisma.orderLineItem.deleteMany({ where: { orderId } });
        }
        if (Array.isArray(o.line_items)) {
          for (const li of o.line_items) {
            // Ensure product mapping
            let productId: string | undefined = undefined;
            if (li.product_id) {
              const prod = await prisma.product.upsert({
                where: { shopifyId: String(li.product_id) },
                update: { title: li.title || 'Untitled' },
                create: { tenantId: shop.tenantId, shopifyId: String(li.product_id), title: li.title || 'Untitled' }
              });
              productId = prod.id;
            }
            await prisma.orderLineItem.create({
              data: {
                tenantId: shop.tenantId,
                orderId,
                productId,
                quantity: li.quantity || 1,
                unitPrice: li.price ? parseFloat(li.price) : 0
              }
            });
          }
        }
        break;
      }
      default:
        logger.info({ topic }, 'Unhandled webhook topic (ignored)');
        break;
    }
    logger.info({ topic, shopDomain }, 'Webhook processed');
    return res.status(200).send('OK');
  } catch (e: any) {
    logger.error({ topic, err: e }, 'Webhook processing failed');
    return res.status(500).send('Error');
  }
});
