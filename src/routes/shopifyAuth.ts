import { Router } from 'express';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { prisma } from '../services/prisma.js';
import { shopifyService } from '../services/shopify.js';
import { authMiddleware } from '../middleware/auth.js';

interface PendingState { tenantId: string; shop: string; createdAt: number; }
const stateStore = new Map<string, PendingState>();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

function pruneStates() {
  const now = Date.now();
  for (const [k, v] of stateStore.entries()) {
    if (now - v.createdAt > STATE_TTL_MS) stateStore.delete(k);
  }
}

export const shopifyAuthRouter = Router();
shopifyAuthRouter.use(authMiddleware);

shopifyAuthRouter.post('/install', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const { shopDomain } = req.body;
  if (!shopDomain || !/\.myshopify\.com$/i.test(shopDomain)) {
    return res.status(400).json({ error: 'shopDomain must end with .myshopify.com' });
  }
  const state = generateState();
  stateStore.set(state, { tenantId, shop: shopDomain, createdAt: Date.now() });
  pruneStates();
  const scopes = env.SHOPIFY_SCOPES.join(',');
  const redirectUri = `${env.SHOPIFY_APP_URL}/api/shopify/callback`;
  const installUrl = `https://${shopDomain}/admin/oauth/authorize?client_id=${env.SHOPIFY_API_KEY}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;
  return res.json({ installUrl, state });
});

// Callback after user authorizes app
shopifyAuthRouter.get('/callback', async (req, res) => {
  const { code, hmac, state, shop } = req.query as Record<string, string>;
  if (!code || !hmac || !state || !shop) {
    return res.status(400).send('Missing parameters');
  }
  const record = stateStore.get(state);
  if (!record || record.shop.toLowerCase() !== shop.toLowerCase()) {
    return res.status(400).send('Invalid or expired state');
  }
  // Validate HMAC (basic): HMAC is computed over the query string excluding hmac & signature.
  const sorted = Object.keys(req.query)
    .filter(k => k !== 'hmac' && k !== 'signature')
    .sort()
    .map(k => `${k}=${req.query[k]}`)
    .join('&');
  const digest = crypto.createHmac('sha256', env.SHOPIFY_API_SECRET).update(sorted).digest('hex');
  if (digest !== hmac) {
    return res.status(401).send('Bad HMAC');
  }
  try {
    let accessToken: string;
    if (env.DEV_FAKE_SHOPIFY) {
      accessToken = 'dev_fake_token';
    } else {
      accessToken = await shopifyService.exchangeCodeForToken(shop, code);
    }
    // Upsert shop row
    await prisma.shopifyShop.upsert({
      where: { shopDomain: shop },
      create: { tenantId: record.tenantId, shopDomain: shop, accessToken, installState: 'active' },
      update: { accessToken, installState: 'active', updatedAt: new Date() }
    });
    stateStore.delete(state);
    return res.status(200).send('Shop connected');
  } catch (e: any) {
    return res.status(500).send(e.message);
  }
});
