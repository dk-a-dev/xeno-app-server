import { Router } from 'express';
import { tenantsRouter } from './tenants.ts';
import { metricsRouter } from './metrics.js';
import { syncRouter } from './sync.js';
import { webhooksRouter } from './webhooks.js';

export const apiRouter = Router();
apiRouter.use('/tenants', tenantsRouter);
apiRouter.use('/metrics', metricsRouter);
apiRouter.use('/sync', syncRouter);
apiRouter.use('/webhooks', webhooksRouter);

// Dev-only utilities
if (process.env.NODE_ENV !== 'production') {
	apiRouter.post('/dev/seed', async (req, res) => {
		try {
			const { prisma } = await import('../services/prisma.js');
			const tenantId = req.body.tenantId;
			if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
			// Create a few customers & orders if none exist
			const existingOrders = await prisma.order.count({ where: { tenantId } });
			const existingCustomers = await prisma.customer.count({ where: { tenantId } });
			if (existingOrders > 0 || existingCustomers > 0) {
				return res.json({ status: 'skipped', reason: 'data already present' });
			}
			const cust = await prisma.customer.create({ data: { tenantId, email: 'seed@example.com', firstName: 'Seed', lastName: 'User' }});
			const now = Date.now();
			for (let i = 0; i < 5; i++) {
				const order = await prisma.order.create({
					data: {
						tenantId,
						totalPrice: 50 + i * 10,
						orderDate: new Date(now - i * 86400000)
					}
				});
				await prisma.orderLineItem.create({
					data: {
						tenantId,
						orderId: order.id,
						quantity: 1,
						unitPrice: order.totalPrice
					}
				});
			}
			return res.json({ status: 'seeded' });
		} catch (e: any) {
			return res.status(500).json({ error: e.message });
		}
	});
}
