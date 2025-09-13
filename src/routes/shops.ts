import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../services/prisma.js';

export const shopsRouter = Router();

shopsRouter.get('/', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.auth!.tenantId;
    const shops = await prisma.shopifyShop.findMany({
      where: { tenantId },
      select: { id: true, shopDomain: true, installState: true, lastSyncAt: true, createdAt: true, updatedAt: true }
    });
    return res.json({ shops });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
