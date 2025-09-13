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

export const apiRouter = Router();
apiRouter.use('/tenants', tenantsRouter);
apiRouter.use('/metrics', metricsRouter);
apiRouter.use('/sync', syncRouter);
apiRouter.use('/webhooks', webhooksRouter);
apiRouter.use('/shopify', shopifyAuthRouter);
apiRouter.use('/shops', shopsRouter);
apiRouter.use('/customers', customersRouter);
apiRouter.use('/orders', ordersRouter);
apiRouter.use('/products', productsRouter);

// Dev-only utilities
if (process.env.NODE_ENV !== 'production') {
	apiRouter.post('/dev/seed', authMiddleware, async (req, res) => {
		try {
			const { prisma } = await import('../services/prisma.js');
			const bodyTenantId = req.body.tenantId as string | undefined;
			const tenantId = bodyTenantId || req.auth!.tenantId;
			const tenantExists = await prisma.tenant.findUnique({ where: { id: tenantId } });
			if (!tenantExists) return res.status(404).json({ error: 'Tenant not found' });
			const existing = await prisma.order.count({ where: { tenantId } });
			if (existing > 0) return res.json({ status: 'skipped', reason: 'data already present' });

			const now = Date.now();
			const customerCount = 15;
			const productCount = 10;
			const ordersPerCustomer = 4;

			await prisma.$transaction(async (tx) => {
				// Customers
				const customers = [] as { id: string }[];
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
				// Products
				const products = [] as { id: string; price: number }[];
				for (let p = 0; p < productCount; p++) {
					const price = 10 + p * 3;
					const product = await tx.product.create({
						data: {
							tenantId,
							title: `Product ${p}`
						}
					});
					products.push({ id: product.id, price });
				}
				// Orders
				for (const cust of customers) {
					for (let o = 0; o < ordersPerCustomer; o++) {
						const daysAgo = Math.floor(Math.random() * 30);
						const orderDate = new Date(now - daysAgo * 86400000);
						// pick 1-3 products
						const lineCount = 1 + Math.floor(Math.random() * 3);
						let total = 0;
						const chosen = [...products].sort(() => 0.5 - Math.random()).slice(0, lineCount);
						const order = await tx.order.create({
							data: {
								tenantId,
								customerId: cust.id,
								orderDate,
								totalPrice: 0
							}
						});
						for (const prod of chosen) {
							const quantity = 1 + Math.floor(Math.random() * 2);
							total += prod.price * quantity;
							await tx.orderLineItem.create({
								data: {
									tenantId,
									orderId: order.id,
									productId: prod.id,
									quantity,
									unitPrice: prod.price
								}
							});
						}
						await tx.order.update({ where: { id: order.id }, data: { totalPrice: total } });
					}
				}
			});
			return res.json({ status: 'seeded', customers: customerCount, products: productCount, orders: customerCount * ordersPerCustomer });
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
