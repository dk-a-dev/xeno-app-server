import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';

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

metricsRouter.get('/customer-growth', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const days = parseInt(String(req.query.days || '30'), 10);
  const startDate = new Date(Date.now() - days * 86400000);
  // Fetch customers created after startDate
  const customers = await prisma.customer.findMany({ where: { tenantId, createdAt: { gte: startDate } }, select: { createdAt: true } });
  const bucket: Record<string, number> = {};
  customers.forEach(c => {
    const key = c.createdAt.toISOString().slice(0,10); // YYYY-MM-DD
    bucket[key] = (bucket[key] || 0) + 1;
  });
  const daysArr: { date: string; newCustomers: number; cumulativeCustomers: number }[] = [];
  let cumulative = await prisma.customer.count({ where: { tenantId, createdAt: { lt: new Date(startDate.toISOString().slice(0,10)) } } });
  for (let i = 0; i <= days; i++) {
    const d = new Date(startDate.getTime() + i*86400000);
    const key = d.toISOString().slice(0,10);
    const newCount = bucket[key] || 0;
    cumulative += newCount;
    daysArr.push({ date: key, newCustomers: newCount, cumulativeCustomers: cumulative });
  }
  return res.json(daysArr);
});

metricsRouter.get('/product-performance', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const limit = Math.min(50, parseInt(String(req.query.limit || '10'), 10));
  const rows: Array<{ productId: string | null; revenue: string; units: number }> = await prisma.$queryRaw(Prisma.sql`SELECT "productId", COALESCE(SUM("quantity" * "unitPrice"),0) AS revenue, COALESCE(SUM("quantity"),0) AS units FROM "OrderLineItem" WHERE "tenantId"=${tenantId} AND "productId" IS NOT NULL GROUP BY "productId" ORDER BY revenue DESC LIMIT ${limit}`);
  const productIds = rows.map(r => r.productId).filter((x): x is string => !!x);
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  const result = rows.map(r => {
    const prod = products.find(p => p.id === r.productId);
    return { productId: r.productId, title: prod?.title || 'Unknown', revenue: Number(r.revenue), units: Number(r.units) };
  });
  return res.json(result);
});

metricsRouter.get('/order-distribution-hour', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const days = Math.min(90, parseInt(String(req.query.days || '7'), 10));
  const start = new Date(Date.now() - days * 86400000);
  const rows: Array<{ hour: number; orders: bigint; revenue: string | null }> = await prisma.$queryRaw(Prisma.sql`SELECT EXTRACT(HOUR FROM "orderDate")::int AS hour, COUNT(*)::bigint AS orders, COALESCE(SUM("totalPrice"),0) AS revenue FROM "Order" WHERE "tenantId"=${tenantId} AND "orderDate">=${start} GROUP BY hour ORDER BY hour ASC`);
  const base = Array.from({ length:24 }, (_,h)=>({ hour:h, orders:0, revenue:0 }));
  for (const r of rows) {
    if (r.hour >=0 && r.hour < 24) base[r.hour] = { hour: r.hour, orders: Number(r.orders), revenue: Number(r.revenue || 0) };
  }
  return res.json(base);
});

// Custom event counts grouped by type within timeframe
metricsRouter.get('/custom-event-counts', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const { start, end } = req.query;
  const startDate = start ? new Date(String(start)) : new Date(Date.now() - 30 * 86400000);
  const endDate = end ? new Date(String(end)) : new Date();
  const rows: Array<{ type: string; count: bigint }> = await prisma.$queryRaw(Prisma.sql`SELECT "type", COUNT(*)::bigint AS count FROM "CustomEvent" WHERE "tenantId"=${tenantId} AND "occurredAt" BETWEEN ${startDate} AND ${endDate} GROUP BY "type" ORDER BY count DESC`);
  return res.json(rows.map(r => ({ type: r.type, count: Number(r.count) })));
});

