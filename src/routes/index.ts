import { Router } from 'express';
import { tenantsRouter } from './tenants.js';
import { metricsRouter } from './metrics.js';
import { syncRouter } from './sync.js';
import { webhooksRouter } from './webhooks.js';
import { shopifyAuthRouter } from './shopifyAuth.js';
import { authMiddleware } from '../middleware/auth.js';

export const apiRouter = Router();
apiRouter.use('/tenants', tenantsRouter);
apiRouter.use('/metrics', metricsRouter);
apiRouter.use('/sync', syncRouter);
apiRouter.use('/webhooks', webhooksRouter);
apiRouter.use('/shopify', shopifyAuthRouter);

// Dev-only utilities
if (process.env.NODE_ENV !== 'production') {
	apiRouter.post('/dev/seed', authMiddleware, async (req, res) => {
		try {
			const { prisma } = await import('../services/prisma.js');
			// Prefer explicit tenantId from body, else use authenticated tenant
			const bodyTenantId = req.body.tenantId as string | undefined;
			const tenantId = bodyTenantId || req.auth!.tenantId;
			// Verify tenant exists to avoid FK violation
			const tenantExists = await prisma.tenant.findUnique({ where: { id: tenantId } });
			if (!tenantExists) return res.status(404).json({ error: 'Tenant not found' });
			const existingOrders = await prisma.order.count({ where: { tenantId } });
			const existingCustomers = await prisma.customer.count({ where: { tenantId } });
			if (existingOrders > 0 || existingCustomers > 0) {
				return res.json({ status: 'skipped', reason: 'data already present' });
			}
			await prisma.$transaction(async (tx) => {
				const cust = await tx.customer.create({ data: { tenantId, email: 'seed@example.com', firstName: 'Seed', lastName: 'User' } });
				const now = Date.now();
				for (let i = 0; i < 5; i++) {
					const order = await tx.order.create({
						data: {
							tenantId,
							customerId: cust.id,
							totalPrice: 50 + i * 10,
							orderDate: new Date(now - i * 86400000)
						}
					});
					await tx.orderLineItem.create({
						data: {
							tenantId,
							orderId: order.id,
							quantity: 1,
							unitPrice: order.totalPrice
						}
					});
				}
			});
			return res.json({ status: 'seeded' });
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
