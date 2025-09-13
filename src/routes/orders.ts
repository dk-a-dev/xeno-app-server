import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import { authMiddleware } from '../middleware/auth.js';

export const ordersRouter = Router();
ordersRouter.use(authMiddleware);

ordersRouter.get('/', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 100);
  const cursor = req.query.cursor as string | undefined;
  const q = (req.query.q as string | undefined)?.trim();
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined;
  const minTotal = req.query.minTotal ? parseFloat(String(req.query.minTotal)) : undefined;
  const maxTotal = req.query.maxTotal ? parseFloat(String(req.query.maxTotal)) : undefined;

  const where: any = { tenantId };
  if (dateFrom || dateTo) {
    where.orderDate = {};
    if (dateFrom) where.orderDate.gte = dateFrom;
    if (dateTo) where.orderDate.lte = dateTo;
  }
  if (minTotal !== undefined || maxTotal !== undefined) {
    where.totalPrice = {};
    if (!isNaN(minTotal!)) where.totalPrice.gte = minTotal;
    if (!isNaN(maxTotal!)) where.totalPrice.lte = maxTotal;
  }
  if (q) {
    // Join on customer via relation filter (limited to name/email fields)
    where.OR = [
      { customer: { email: { contains: q, mode: 'insensitive' } } },
      { customer: { firstName: { contains: q, mode: 'insensitive' } } },
      { customer: { lastName: { contains: q, mode: 'insensitive' } } }
    ];
  }

  const orders = await prisma.order.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { orderDate: 'desc' },
    select: {
      id: true,
      orderDate: true,
      totalPrice: true,
      customerId: true,
      customer: { select: { email: true, firstName: true, lastName: true } },
      _count: { select: { lineItems: true } }
    }
  });

  let nextCursor: string | undefined;
  if (orders.length > limit) {
    const next = orders.pop();
    nextCursor = next!.id;
  }

  return res.json({ items: orders, nextCursor });
});

ordersRouter.get('/:id', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const { id } = req.params;
  const order = await prisma.order.findFirst({
    where: { id, tenantId },
    include: { lineItems: true, customer: true }
  });
  if (!order) return res.status(404).json({ error: 'Not found' });
  return res.json(order);
});
