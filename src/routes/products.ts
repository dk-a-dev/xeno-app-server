import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import { authMiddleware } from '../middleware/auth.js';

export const productsRouter: Router = Router();
productsRouter.use(authMiddleware);

productsRouter.get('/', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 100);
  const cursor = req.query.cursor as string | undefined;
  const q = (req.query.q as string | undefined)?.trim();
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined;

  const where: any = { tenantId };
  if (q) where.title = { contains: q, mode: 'insensitive' };
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = dateFrom;
    if (dateTo) where.createdAt.lte = dateTo;
  }

  const products = await prisma.product.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' }
  });

  let nextCursor: string | undefined;
  if (products.length > limit) {
    const next = products.pop();
    nextCursor = next!.id;
  }

  return res.json({ items: products, nextCursor });
});


productsRouter.get('/:id', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const { id } = req.params;
  const product = await prisma.product.findFirst({ where: { id, tenantId } });
  if (!product) return res.status(404).json({ error: 'Not found' });
  return res.json(product);
});
