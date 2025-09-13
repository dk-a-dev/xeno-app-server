import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import { authMiddleware } from '../middleware/auth.js';

export const metricsRouter = Router();
metricsRouter.use(authMiddleware);

metricsRouter.get('/summary', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const [customers, ordersAgg] = await Promise.all([
    prisma.customer.count({ where: { tenantId } }),
    prisma.order.aggregate({
      _count: { id: true },
      _sum: { totalPrice: true },
      where: { tenantId }
    })
  ]);
  return res.json({
    totalCustomers: customers,
    totalOrders: ordersAgg._count.id,
    totalRevenue: ordersAgg._sum.totalPrice || 0
  });
});

metricsRouter.get('/orders-by-date', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const { start, end } = req.query;
  const startDate = start ? new Date(String(start)) : new Date(Date.now() - 30 * 86400000);
  const endDate = end ? new Date(String(end)) : new Date();
  const data = await prisma.order.groupBy({
    by: ['orderDate'],
    where: { tenantId, orderDate: { gte: startDate, lte: endDate } },
    _count: { id: true },
    _sum: { totalPrice: true },
    orderBy: { orderDate: 'asc' }
  });
  return res.json(data.map(d => ({ date: d.orderDate, orders: d._count.id, revenue: d._sum.totalPrice })));
});

metricsRouter.get('/top-customers', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const top = await prisma.order.groupBy({
    by: ['customerId'],
    where: { tenantId },
    _sum: { totalPrice: true },
    orderBy: { _sum: { totalPrice: 'desc' } },
    take: 5
  });
  const customers = await prisma.customer.findMany({ where: { id: { in: top.map(t => t.customerId) } } });
  const result = top.map(t => ({
    customer: customers.find(c => c.id === t.customerId),
    spend: t._sum.totalPrice || 0
  }));
  return res.json(result);
});
