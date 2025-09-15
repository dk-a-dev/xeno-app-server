import crypto from 'crypto';
import { prisma } from './prisma.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

interface ShopifyCustomer { id: string; email?: string; first_name?: string; last_name?: string; }
interface ShopifyProduct { id: string; title: string; }
interface ShopifyOrderLineItem { id: string; product_id?: string; quantity: number; price: string; }
interface ShopifyOrder { id: string; created_at: string; total_price: string; customer?: ShopifyCustomer; line_items: ShopifyOrderLineItem[]; }

interface FullSyncResult {
  customers: number;
  products: number;
  orders: number;
  durationMs: number;
  shopDomain?: string;
  stubbed: boolean;
}

class ShopifyService {
  generateInstallUrl(shopDomain: string, state: string) {
    const scopes = ['read_orders', 'read_products', 'read_customers'];
    return `https://${shopDomain}/admin/oauth/authorize?client_id=${env.SHOPIFY_API_KEY}&scope=${scopes.join(',')}&redirect_uri=${encodeURIComponent('https://your-app.com/oauth/callback')}&state=${state}`;
  }

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
  private async restPaginated(shopDomain: string, token: string, resource: string): Promise<any[]> {
    const collected: any[] = [];
    let pageInfo: string | undefined = undefined;
    const base = `https://${shopDomain}/admin/api/${env.SHOPIFY_API_VERSION}/${resource}.json`;
    let attempt = 0;
    while (true) {
      let url = `${base}?limit=250`;
      if (pageInfo) url += `&page_info=${encodeURIComponent(pageInfo)}`;
      const resp = await fetch(url, { headers: { 'X-Shopify-Access-Token': token, 'Accept': 'application/json' } });
      if (resp.status === 429) {
        // Rate limited; exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
        await new Promise(r => setTimeout(r, delay));
        attempt++;
        continue;
      }
      attempt = 0; // reset after successful call
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Shopify ${resource} fetch failed: ${resp.status} ${text}`);
      }
      // Rate limit header format: current/limit e.g. 10/40
      const apiCallLimit = resp.headers.get('x-shopify-shop-api-call-limit');
      if (apiCallLimit) {
        const [used, cap] = apiCallLimit.split('/').map(Number);
        if (cap && used / cap > 0.8) {
          // Soft throttle to stay under hard limits
            await new Promise(r => setTimeout(r, 300));
        }
      }
      const json = await resp.json();
      const key = resource.split('/')[0];
      const arr = json[key] || [];
      collected.push(...arr);
      const link = resp.headers.get('link');
      if (!link) break;
      const nextMatch = link.split(',').map(s => s.trim()).find(s => s.endsWith('rel="next"'));
      if (!nextMatch) break;
      const urlPart = nextMatch.split(';')[0].trim();
      const m = urlPart.match(/page_info=([^&>]+)/);
      if (!m) break;
      pageInfo = decodeURIComponent(m[1].replace(/"/g, ''));
      // Safety: stop after 40 pages to avoid runaway in dev
      if (collected.length > 40 * 250) {
        logger.warn({ resource, collected: collected.length }, 'Pagination early stop (safety)');
        break;
      }
    }
    return collected;
  }

  private buildStubData(tenantId: string) {
    const now = new Date();
    
    // Generate 8 customers with diverse names (reduced from 20)
    const customerNames = [
      { first: 'Alice', last: 'Johnson' }, { first: 'Bob', last: 'Smith' }, { first: 'Carol', last: 'Williams' },
      { first: 'David', last: 'Brown' }, { first: 'Emma', last: 'Davis' }, { first: 'Frank', last: 'Miller' },
      { first: 'Grace', last: 'Wilson' }, { first: 'Henry', last: 'Moore' }
    ];
    
    const customers: ShopifyCustomer[] = customerNames.map((name, i) => ({
      id: `c_stub_${i + 1}`,
      email: `${name.first.toLowerCase()}${i + 1}+${tenantId}@example.com`,
      first_name: name.first,
      last_name: name.last
    }));

    // Generate 8 products across different categories (reduced from 15)
    const productData = [
      { title: 'Premium Cotton T-Shirt', price: 29.99 },
      { title: 'Designer Hoodie', price: 89.99 },
      { title: 'Wireless Bluetooth Headphones', price: 159.99 },
      { title: 'Smart Fitness Watch', price: 299.99 },
      { title: 'Vintage Leather Jacket', price: 199.99 },
      { title: 'Running Sneakers', price: 129.99 },
      { title: 'Artisan Coffee Mug', price: 24.99 },
      { title: 'Eco-Friendly Water Bottle', price: 34.99 }
    ];
    
    const products: ShopifyProduct[] = productData.map((product, i) => ({
      id: `p_stub_${i + 1}`,
      title: product.title
    }));

    // Generate manageable number of orders (1-2 orders per customer max)
    const orders: ShopifyOrder[] = [];
    let orderCounter = 1;
    
    // Create orders for each customer (1-2 orders per customer)
    customers.forEach((customer, customerIndex) => {
      const numOrders = Math.floor(Math.random() * 2) + 1; // 1-2 orders per customer
      
      for (let orderIndex = 0; orderIndex < numOrders; orderIndex++) {
        const daysAgo = Math.floor(Math.random() * 30); // Orders within last 30 days
        const hoursOffset = Math.floor(Math.random() * 24); // Random hour of day
        const orderDate = new Date(now.getTime() - (daysAgo * 24 * 3600_000) - (hoursOffset * 3600_000));
        
        // Single item per order to keep transaction simple
        const productIndex = Math.floor(Math.random() * products.length);
        const selectedProduct = products[productIndex];
        const quantity = Math.floor(Math.random() * 2) + 1; // 1-2 quantity
        const unitPrice = productData[productIndex].price;
        const totalPrice = unitPrice * quantity;
        
        const lineItems: ShopifyOrderLineItem[] = [{
          id: `li_stub_${orderCounter}_1`,
          product_id: selectedProduct.id,
          quantity,
          price: unitPrice.toFixed(2)
        }];
        
        orders.push({
          id: `o_stub_${orderCounter}`,
          created_at: orderDate.toISOString(),
          total_price: totalPrice.toFixed(2),
          customer,
          line_items: lineItems
        });
        
        orderCounter++;
      }
    });
    
    return { customers, products, orders };
  }

  async fetchCustomers(tenantId: string, shopDomain?: string, token?: string): Promise<ShopifyCustomer[]> {
    if (env.DEV_FAKE_SHOPIFY || !shopDomain || !token) return this.buildStubData(tenantId).customers;
    return this.restPaginated(shopDomain, token, 'customers');
  }
  async fetchProducts(tenantId: string, shopDomain?: string, token?: string): Promise<ShopifyProduct[]> {
    if (env.DEV_FAKE_SHOPIFY || !shopDomain || !token) return this.buildStubData(tenantId).products;
    return this.restPaginated(shopDomain, token, 'products');
  }
  async fetchOrders(tenantId: string, shopDomain?: string, token?: string): Promise<ShopifyOrder[]> {
    if (env.DEV_FAKE_SHOPIFY || !shopDomain || !token) return this.buildStubData(tenantId).orders;
    return this.restPaginated(shopDomain, token, 'orders');
  }

  async fullSync(tenantId: string): Promise<FullSyncResult> {
    const started = Date.now();
    // Acquire active shop & token (first active for tenant)
    const shop = await prisma.shopifyShop.findFirst({ where: { tenantId, installState: 'active' } });
    const shopDomain = shop?.shopDomain;
    const token = shop?.accessToken || undefined;
    const stubbed = env.DEV_FAKE_SHOPIFY || !token || !shopDomain;
    if (stubbed && !env.DEV_FAKE_SHOPIFY) {
      logger.warn({ tenantId }, 'No active shop/token; using stub data ingestion');
    }

    let customers: ShopifyCustomer[] = [];
    let products: ShopifyProduct[] = [];
    let orders: ShopifyOrder[] = [];
    try {
      [customers, products, orders] = await Promise.all([
        this.fetchCustomers(tenantId, shopDomain, token),
        this.fetchProducts(tenantId, shopDomain, token),
        this.fetchOrders(tenantId, shopDomain, token)
      ]);
    } catch (e: any) {
      logger.error({ err: e, tenantId }, 'Fetch phase failed');
      throw e;
    }

    // Index for quick lookups
    const customerIdMap = new Map<string, string>();
    const productIdMap = new Map<string, string>();

    await prisma.$transaction(async (tx) => {
      for (const c of customers) {
        const record = await tx.customer.upsert({
          where: { shopifyId: c.id },
          update: { email: c.email, firstName: c.first_name, lastName: c.last_name },
          create: { tenantId, shopifyId: c.id, email: c.email, firstName: c.first_name, lastName: c.last_name }
        });
        customerIdMap.set(c.id, record.id);
      }
      for (const p of products) {
        const record = await tx.product.upsert({
          where: { shopifyId: p.id },
          update: { title: p.title },
          create: { tenantId, shopifyId: p.id, title: p.title }
        });
        productIdMap.set(p.id, record.id);
      }
      for (const o of orders) {
        const existing = await tx.order.findUnique({ where: { shopifyId: o.id } });
        let orderId: string;
        const baseData = {
          totalPrice: o.total_price ? parseFloat(o.total_price) : 0,
          orderDate: new Date(o.created_at),
          customerId: o.customer?.id ? customerIdMap.get(o.customer.id) : undefined
        };
        if (!existing) {
          const created = await tx.order.create({ data: { tenantId, shopifyId: o.id, ...baseData } });
            orderId = created.id;
        } else {
          const updated = await tx.order.update({ where: { id: existing.id }, data: baseData });
          orderId = updated.id;
          await tx.orderLineItem.deleteMany({ where: { orderId } });
        }
        for (const li of o.line_items) {
          await tx.orderLineItem.create({
            data: {
              tenantId,
              orderId,
              productId: li.product_id ? productIdMap.get(li.product_id) : undefined,
              quantity: li.quantity,
              unitPrice: li.price ? parseFloat(li.price) : 0
            }
          });
        }
      }
      if (shop && !stubbed) {
        await tx.shopifyShop.update({ where: { id: shop.id }, data: { lastSyncAt: new Date() } });
      }
    });

    const durationMs = Date.now() - started;
    logger.info({ tenantId, counts: { customers: customers.length, products: products.length, orders: orders.length }, durationMs, stubbed }, 'Full sync completed');
    return { customers: customers.length, products: products.length, orders: orders.length, durationMs, shopDomain, stubbed };
  }
}

export const shopifyService = new ShopifyService();
