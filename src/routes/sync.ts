import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { shopifyService } from '../services/shopify.js';

export const syncRouter = Router();
syncRouter.use(authMiddleware);

// Manual trigger for a tenant's Shopify sync
syncRouter.post('/trigger', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  try {
    const result = await shopifyService.fullSync(tenantId);
    return res.json({ status: 'ok', ...result });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
