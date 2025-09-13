import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../services/prisma.js'; 

export const eventsRouter = Router();
eventsRouter.use(authMiddleware);

eventsRouter.post('/', async (req, res) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { type, customerId, metadata, occurredAt } = req.body || {};
    if (!type || typeof type !== 'string') return res.status(400).json({ error: 'type required' });
    if (customerId) {
      const exists = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
      if (!exists) return res.status(400).json({ error: 'customer not found for tenant' });
    }
  const event = await (prisma as any).customEvent.create({
      data: {
        tenantId,
        type,
        customerId: customerId || null,
        metadata: metadata ?? null,
        occurredAt: occurredAt ? new Date(occurredAt) : undefined
      }
    });
    return res.status(201).json(event);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /events?type=&from=&to=&cursor=
eventsRouter.get('/', async (req, res) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { type, from, to, cursor } = req.query as Record<string, string|undefined>;
    const where: any = { tenantId };
    if (type) where.type = type;
    if (from || to) {
      where.occurredAt = {};
      if (from) where.occurredAt.gte = new Date(from);
      if (to) where.occurredAt.lte = new Date(to);
    }
    const take = 50;
  const events = await (prisma as any).customEvent.findMany({
      where,
      take: take + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: { occurredAt: 'desc' }
    });
    let nextCursor: string | undefined;
    if (events.length > take) {
      const next = events.pop();
      nextCursor = next?.id;
    }
    return res.json({ items: events, nextCursor });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
