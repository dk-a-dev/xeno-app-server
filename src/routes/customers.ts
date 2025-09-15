import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import { authMiddleware } from '../middleware/auth.js';

export const customersRouter: Router = Router();


customersRouter.use(authMiddleware);

customersRouter.get('/', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 100);
  const cursor = req.query.cursor as string | undefined;
  const q = (req.query.q as string | undefined)?.trim();
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined;

  const where: any = { tenantId };
  if (q) {
    where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } }
    ];
  }
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = dateFrom;
    if (dateTo) where.createdAt.lte = dateTo;
  }

  const customers = await prisma.customer.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' }
  });

  let nextCursor: string | undefined;
  if (customers.length > limit) {
    const next = customers.pop();
    nextCursor = next!.id;
  }

  return res.json({ items: customers, nextCursor });
});


customersRouter.get('/:id', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const { id } = req.params;
  const customer = await prisma.customer.findFirst({ where: { id, tenantId } });
  if (!customer) return res.status(404).json({ error: 'Not found' });
  return res.json(customer);
});
