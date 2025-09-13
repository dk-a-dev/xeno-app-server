import { prisma } from './prisma.js';
import { logger } from '../config/logger.js';
import crypto from 'crypto';

export interface ProcessWebhookArgs {
  topic: string;
  shopDomain: string;
  rawBody: string;
  headers: Record<string,string>;
}

function safeJsonParse(str: string): any { try { return JSON.parse(str); } catch { return null; } }

export async function processWebhook({ topic, shopDomain, rawBody, headers }: ProcessWebhookArgs) {
  const eventId = headers['x-shopify-event-id'];
  const triggeredAtHeader = headers['x-shopify-triggered-at'];
  const shop = await prisma.shopifyShop.findUnique({ where: { shopDomain } });
  if (!shop) {
    logger.warn({ shopDomain }, 'Webhook for unknown shop (processor)');
    return;
  }
  // dedupe already should have happened at enqueue, but double check for safety
  if (eventId) {
    const prismaAny: any = prisma as any;
    const existing = await prismaAny.webhookEvent.findUnique({ where: { eventId } });
    if (existing) { logger.info({ eventId, topic }, 'Duplicate webhook ignored (processor)'); return; }
    const rawBodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    let triggeredAt: Date | undefined = undefined;
    if (triggeredAtHeader) { const t = new Date(triggeredAtHeader); if (!isNaN(t.getTime())) triggeredAt = t; }
    await prismaAny.webhookEvent.create({ data: { eventId, topic, shopDomain, rawBodyHash, triggeredAt } });
  }

  const payload = safeJsonParse(rawBody);
  if (!payload) { logger.warn({ topic }, 'Invalid JSON payload in processor'); return; }

  try {
    switch (topic) {
      case 'customers/create':
      case 'customers/update': {
        const c = payload;
        await prisma.customer.upsert({
          where: { shopifyId: String(c.id) },
            update: { email: c.email, firstName: c.first_name, lastName: c.last_name },
            create: { tenantId: shop.tenantId, shopifyId: String(c.id), email: c.email, firstName: c.first_name, lastName: c.last_name }
        });
        break;
      }
      case 'products/create':
      case 'products/update': {
        const p = payload;
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
        const o = payload;
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
        const orderDate = new Date(o.created_at || o.processed_at || triggeredAtHeader || Date.now());
        if (!existing) {
          const created = await prisma.order.create({ data: { tenantId: shop.tenantId, shopifyId: String(o.id), customerId, totalPrice: o.total_price ? parseFloat(o.total_price) : 0, orderDate } });
          orderId = created.id;
        } else {
          const updated = await prisma.order.update({ where: { id: existing.id }, data: { customerId, totalPrice: o.total_price ? parseFloat(o.total_price) : 0, orderDate } });
          orderId = updated.id;
          await prisma.orderLineItem.deleteMany({ where: { orderId } });
        }
        if (Array.isArray(o.line_items)) {
          for (const li of o.line_items) {
            let productId: string | undefined = undefined;
            if (li.product_id) {
              const prod = await prisma.product.upsert({
                where: { shopifyId: String(li.product_id) },
                update: { title: li.title || 'Untitled' },
                create: { tenantId: shop.tenantId, shopifyId: String(li.product_id), title: li.title || 'Untitled' }
              });
              productId = prod.id;
            }
            await prisma.orderLineItem.create({ data: { tenantId: shop.tenantId, orderId, productId, quantity: li.quantity || 1, unitPrice: li.price ? parseFloat(li.price) : 0 } });
          }
        }
        break;
      }
      default:
        logger.info({ topic }, 'Unhandled webhook topic (processor)');
        break;
    }
    logger.info({ topic, shopDomain }, 'Webhook processed (async)');
  } catch (e: any) {
    logger.error({ topic, err: e }, 'Webhook processing failed (async)');
    throw e;
  }
}
