import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import { authMiddleware } from '../middleware/auth.js';

export const ordersRouter = Router();
ordersRouter.use(authMiddleware);

ordersRouter.get('/', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 100);
  const cursor = req.query.cursor as string | undefined;

  const orders = await prisma.order.findMany({
    where: { tenantId },
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
