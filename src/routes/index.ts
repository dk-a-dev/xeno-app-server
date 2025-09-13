import { Router } from 'express';
import { tenantsRouter } from './tenants.js';
import { metricsRouter } from './metrics.js';
import { syncRouter } from './sync.js';
import { webhooksRouter } from './webhooks.js';
import { shopifyAuthRouter } from './shopifyAuth.js';
import { shopsRouter } from './shops.js';
import { authMiddleware } from '../middleware/auth.js';
import { customersRouter } from './customers.js';
import { ordersRouter } from './orders.js';
import { productsRouter } from './products.js';
import { eventsRouter } from './events.js';

export const apiRouter = Router();
apiRouter.use('/tenants', tenantsRouter);
apiRouter.use('/metrics', metricsRouter);
apiRouter.use('/stats', metricsRouter);
apiRouter.use('/sync', syncRouter);
apiRouter.use('/webhooks', webhooksRouter);
apiRouter.use('/shopify', shopifyAuthRouter);
apiRouter.use('/shops', shopsRouter);
apiRouter.use('/customers', customersRouter);
apiRouter.use('/orders', ordersRouter);
apiRouter.use('/products', productsRouter);
apiRouter.use('/events', eventsRouter);

// Dev-only utilities
if (process.env.NODE_ENV !== 'production') {
	apiRouter.post('/dev/seed', authMiddleware, async (req, res) => {
		try {
			const { prisma } = await import('../services/prisma.js');
			const bodyTenantId = req.body.tenantId as string | undefined;
			const tenantId = bodyTenantId || req.auth!.tenantId;
			const tenantExists = await prisma.tenant.findUnique({ where: { id: tenantId } });
			if (!tenantExists) return res.status(404).json({ error: 'Tenant not found' });
			const force = req.query.force === 'true' || req.body.force === true;
			const scale = Math.min(10, Math.max(1, parseInt(String(req.query.scale ?? req.body.scale ?? '1'), 10)));
			const existing = await prisma.order.count({ where: { tenantId } });
			if (existing > 0 && !force) return res.json({ status: 'skipped', reason: 'data already present', hint: 'use ?force=true to regenerate' });
			if (force) {
				await prisma.$transaction([
					prisma.orderLineItem.deleteMany({ where: { tenantId } }),
					prisma.order.deleteMany({ where: { tenantId } }),
					prisma.customer.deleteMany({ where: { tenantId } }),
					prisma.product.deleteMany({ where: { tenantId } })
				]);
			}
			const now = Date.now();
			const customerCount = 25 * scale; // more customers
			const productCount = 18 * scale;  // more products
			const maxOrdersPerCustomer = 8; // varied order counts
			const daySpan = 60; // distribute over 60 days

			function randomOrderCount() {
				// Weighted: many customers have few orders, few have many
				const r = Math.random();
				if (r < 0.55) return 1 + Math.floor(Math.random()*2); // 1-2
				if (r < 0.80) return 3 + Math.floor(Math.random()*2); // 3-4
				if (r < 0.93) return 5 + Math.floor(Math.random()*2); // 5-6
				return 7 + Math.floor(Math.random()*2); // 7-8 power users
			}

			await prisma.$transaction(async (tx) => {
				// Customers
				const customers: { id: string }[] = [];
				for (let i = 0; i < customerCount; i++) {
					const cust = await tx.customer.create({
						data: {
							tenantId,
							email: `user${i}@example.com`,
							firstName: 'User',
							lastName: `#${i}`
						}
					});
					customers.push(cust);
				}
				// Products with different price tiers (some premium)
				const products: { id: string; price: number }[] = [];
				for (let p = 0; p < productCount; p++) {
					const base = 8 + (p % 6) * 4; // cycle base tiers
					const premiumMultiplier = p % 11 === 0 ? 3 : (p % 7 === 0 ? 1.8 : 1);
					const price = Math.round((base * premiumMultiplier + Math.random()*5) * 100)/100;
					const product = await tx.product.create({
						data: { tenantId, title: `Product ${p}` }
					});
					products.push({ id: product.id, price });
				}
				let totalOrders = 0;
				for (const cust of customers) {
					const orderTarget = Math.min(maxOrdersPerCustomer, randomOrderCount());
					for (let o = 0; o < orderTarget; o++) {
						const daysAgo = Math.floor(Math.random() * daySpan);
						const orderDate = new Date(now - daysAgo * 86400000 + Math.floor(Math.random()*8)*3600000); // random hour
						const lineCount = 1 + Math.floor(Math.random() * 4); // 1-4 items
						let total = 0;
						const chosen = [...products].sort(() => 0.5 - Math.random()).slice(0, lineCount);
						const order = await tx.order.create({ data: { tenantId, customerId: cust.id, orderDate, totalPrice: 0 } });
						for (const prod of chosen) {
							const quantity = 1 + Math.floor(Math.random()*3); // 1-3
							total += prod.price * quantity;
							await tx.orderLineItem.create({ data: { tenantId, orderId: order.id, productId: prod.id, quantity, unitPrice: prod.price } });
						}
						await tx.order.update({ where: { id: order.id }, data: { totalPrice: Math.round(total*100)/100 } });
						totalOrders++;
					}
				}
				return { totalOrders };
			});
			const orderCount = await prisma.order.count({ where: { tenantId } });
			return res.json({ status: 'seeded', customers: customerCount, products: productCount, orders: orderCount, scale, force });
		} catch (e: any) {
			return res.status(500).json({ error: e.message });
		}
	});
	apiRouter.post('/dev/create-shop', authMiddleware, async (req, res) => {
		try {
			const { prisma } = await import('../services/prisma.js');
			const tenantId = req.auth!.tenantId;
			const { env } = await import('../config/env.js');
			const { shopDomain = env.DEV_DEFAULT_SHOP_DOMAIN, token = 'dev_fake_token' } = req.body || {};
			const shop = await prisma.shopifyShop.upsert({
				where: { shopDomain },
				update: { accessToken: token, installState: 'active' },
				create: { tenantId, shopDomain, accessToken: token, installState: 'active' }
			});
			return res.json({ status: 'ok', shop });
		} catch (e: any) {
			return res.status(500).json({ error: e.message });
		}
	});
}
