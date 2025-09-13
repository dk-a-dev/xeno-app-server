import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { Decimal } from '@prisma/client/runtime/library';

export const metricsRouter = Router();
metricsRouter.use(authMiddleware);

metricsRouter.get('/summary', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86400000);
  const [customerCount, ordersAgg, recentRevenueAgg] = await Promise.all([
    prisma.customer.count({ where: { tenantId } }),
    prisma.order.aggregate({
      _count: { id: true },
      _sum: { totalPrice: true },
      where: { tenantId }
    }),
    prisma.order.aggregate({
      _sum: { totalPrice: true },
      where: { tenantId, orderDate: { gte: sevenDaysAgo } }
    })
  ]);
  const totalOrders = ordersAgg._count.id;
  const totalRevenueDecimal = (ordersAgg._sum.totalPrice as Decimal | null) || new Decimal(0);
  const totalRevenue = Number(totalRevenueDecimal.toString());
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const recentRevenueDecimal = (recentRevenueAgg._sum.totalPrice as Decimal | null) || new Decimal(0);
  const recentRevenue = Number(recentRevenueDecimal.toString());
  // Simple LTV proxy: totalRevenue / customerCount (if customers > 0)
  const customerLtv = customerCount > 0 ? totalRevenue / customerCount : 0;
  return res.json({
    totalCustomers: customerCount,
    totalOrders,
    totalRevenue,
    averageOrderValue,
    customerLtv,
    recent7DayRevenue: recentRevenue
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
  const idList = top.map(t => t.customerId).filter((id): id is string => !!id);
  const customers = await prisma.customer.findMany({ where: { id: { in: idList } } });
  const result = top.map(t => ({
    customer: customers.find(c => c.id === t.customerId),
    spend: t._sum.totalPrice || 0
  }));
  return res.json(result);
});
