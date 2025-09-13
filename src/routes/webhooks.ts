import { Router } from 'express';
import { shopifyService } from '../services/shopify.js';
import { logger } from '../config/logger.js';

export const webhooksRouter = Router();

// Raw body middleware requirement would be set at app-level in a real implementation
webhooksRouter.post('/shopify', (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'] as string | undefined;
  const rawBody = (req as any).rawBody || JSON.stringify(req.body); // placeholder
  if (!shopifyService.verifyWebhook(rawBody, hmac)) {
    return res.status(401).send('Invalid HMAC');
  }
  logger.info({ topic: req.headers['x-shopify-topic'] }, 'Received webhook (stub)');
  res.status(200).send('OK');
});
