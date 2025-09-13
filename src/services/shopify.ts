import crypto from 'crypto';
import { prisma } from './prisma.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

// Placeholder types for Shopify data (subset)
interface ShopifyCustomer { id: string; email?: string; first_name?: string; last_name?: string; }
interface ShopifyProduct { id: string; title: string; }
interface ShopifyOrderLineItem { id: string; product_id?: string; quantity: number; price: string; }
interface ShopifyOrder { id: string; created_at: string; total_price: string; customer?: ShopifyCustomer; line_items: ShopifyOrderLineItem[]; }

class ShopifyService {
  // Step 1 generate install URL (OAuth) – placeholder values
  generateInstallUrl(shopDomain: string, state: string) {
    const scopes = ['read_orders', 'read_products', 'read_customers'];
    return `https://${shopDomain}/admin/oauth/authorize?client_id=${env.SHOPIFY_API_KEY}&scope=${scopes.join(',')}&redirect_uri=${encodeURIComponent('https://your-app.com/oauth/callback')}&state=${state}`;
  }

  // Step 2: exchange code for token (real call unless DEV_FAKE_SHOPIFY)
  async exchangeCodeForToken(shopDomain: string, code: string) {
    if (env.DEV_FAKE_SHOPIFY) {
      logger.warn({ shopDomain }, 'DEV_FAKE_SHOPIFY enabled; returning fake token');
      return 'dev_fake_token';
    }
    const url = `https://${shopDomain}/admin/oauth/access_token`;
    const body = {
      client_id: env.SHOPIFY_API_KEY,
      client_secret: env.SHOPIFY_API_SECRET,
      code
    } as const;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const text = await resp.text();
      logger.error({ status: resp.status, text }, 'Failed token exchange');
      throw new Error('Token exchange failed');
    }
    const json = await resp.json();
    const token = json.access_token;
    if (!token) throw new Error('No access_token in response');
    logger.info({ shopDomain }, 'Shopify token acquired');
    return token;
  }

  // Webhook HMAC verification
  verifyWebhook(rawBody: string, hmacHeader: string | undefined): boolean {
    if (!hmacHeader) return false;
    const digest = crypto
      .createHmac('sha256', env.SHOPIFY_API_SECRET)
      .update(rawBody, 'utf8')
      .digest('base64');
  const aBuf = Buffer.from(digest, 'utf8');
  const bBuf = Buffer.from(hmacHeader, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  const a = new Uint8Array(aBuf.buffer, aBuf.byteOffset, aBuf.length);
  const b = new Uint8Array(bBuf.buffer, bBuf.byteOffset, bBuf.length);
  return crypto.timingSafeEqual(a, b);
  }

  // Below fetch methods are stubs; real ones would paginate Shopify REST/GraphQL
  async fetchCustomers(_tenantId: string): Promise<ShopifyCustomer[]> { return []; }
  async fetchProducts(_tenantId: string): Promise<ShopifyProduct[]> { return []; }
  async fetchOrders(_tenantId: string): Promise<ShopifyOrder[]> { return []; }

  async fullSync(tenantId: string) {
    // Fetch raw data
    const [customers, products, orders] = await Promise.all([
      this.fetchCustomers(tenantId),
      this.fetchProducts(tenantId),
      this.fetchOrders(tenantId)
    ]);

    // Ingestion (simplified & idempotent where possible)
    // Wrap in a transaction for consistency
    await prisma.$transaction(async (tx) => {
      for (const c of customers) {
        await tx.customer.upsert({
          where: { shopifyId: c.id },
            update: {
              email: c.email,
              firstName: c.first_name,
              lastName: c.last_name
            },
            create: {
              tenantId,
              shopifyId: c.id,
              email: c.email,
              firstName: c.first_name,
              lastName: c.last_name
            }
        });
      }
      for (const p of products) {
        await tx.product.upsert({
          where: { shopifyId: p.id },
          update: { title: p.title },
          create: { tenantId, shopifyId: p.id, title: p.title }
        });
      }
      for (const o of orders) {
        // Upsert order + line items (simplified: delete/recreate line items)
        const existing = await tx.order.findUnique({ where: { shopifyId: o.id } });
        let orderId: string;
        if (!existing) {
          const created = await tx.order.create({
            data: {
              tenantId,
              shopifyId: o.id,
              totalPrice: o.total_price ? parseFloat(o.total_price) : 0,
              orderDate: new Date(o.created_at)
            }
          });
          orderId = created.id;
        } else {
          const updated = await tx.order.update({
            where: { id: existing.id },
            data: {
              totalPrice: o.total_price ? parseFloat(o.total_price) : 0,
              orderDate: new Date(o.created_at)
            }
          });
          orderId = updated.id;
          await tx.orderLineItem.deleteMany({ where: { orderId } });
        }
        for (const li of o.line_items) {
          await tx.orderLineItem.create({
            data: {
              tenantId,
              orderId,
              productId: undefined, // Would map via product shopifyId lookup
              quantity: li.quantity,
              unitPrice: li.price ? parseFloat(li.price) : 0
            }
          });
        }
      }
    });

    logger.info({ tenantId }, 'Full sync executed (stub w/ ingestion)');
    return { customers: customers.length, products: products.length, orders: orders.length };
  }
}

export const shopifyService = new ShopifyService();
