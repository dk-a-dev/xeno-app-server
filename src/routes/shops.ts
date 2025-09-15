import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../services/prisma.js';

export const shopsRouter: Router = Router();

shopsRouter.get('/', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.auth!.tenantId;
    const q = (req.query.q as string | undefined)?.trim();
    const state = (req.query.state as string | undefined)?.trim();
    const where: any = { tenantId };
    if (q) where.shopDomain = { contains: q, mode: 'insensitive' };
    if (state) where.installState = state;
    const shops = await prisma.shopifyShop.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: { id: true, shopDomain: true, installState: true, lastSyncAt: true, createdAt: true, updatedAt: true }
    });
    return res.json({ shops });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
