import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { apiRouter } from './routes/index.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map(s => s.trim()) }));
  app.use('/api/webhooks/shopify', express.raw({ type: '*/*' }));

  app.use(express.json());

  app.get('/', (_req, res) => res.json({ 
    name: 'Xeno Shopify Data Ingestion & Insights API', 
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      api: '/api/v1',
      docs: 'See README.md for endpoint documentation'
    },
    timestamp: new Date().toISOString()
  }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  
  app.get('/docs', (_req, res) => {
    const docsContent = `
# Xeno Shopify Data Ingestion & Insights API

## Base URL
\`https://xeno-app-server.onrender.com\`

## Authentication
All protected endpoints require Bearer token authentication:
\`Authorization: Bearer <token>\`

## Core Endpoints

### Authentication
- \`POST /api/v1/tenants\` - Create tenant account
- \`POST /api/v1/tenants/login\` - Login & get JWT token

### Shops Management
- \`GET /api/v1/shops\` - List tenant's shops
- \`POST /api/v1/dev/create-shop\` - Dev: Create shop (protected)

### Data Ingestion
- \`POST /api/v1/sync/trigger\` - Manual sync trigger (protected)
- \`POST /api/v1/webhooks/shopify\` - Shopify webhook endpoint
- \`POST /api/v1/dev/seed\` - Dev: Seed sample data (protected)

### Metrics & Analytics
- \`GET /api/v1/metrics/summary\` - Overview metrics (protected)
- \`GET /api/v1/metrics/orders-by-date\` - Orders time series (protected)
- \`GET /api/v1/metrics/top-customers\` - Top customers by spend (protected)
- \`GET /api/v1/metrics/product-performance\` - Product analytics (protected)
- \`GET /api/v1/metrics/customer-growth\` - Customer growth trends (protected)
- \`GET /api/v1/metrics/order-distribution-hour\` - Hourly order patterns (protected)
- \`GET /api/v1/metrics/custom-event-counts\` - Event aggregations (protected)

### Entity Listings
- \`GET /api/v1/customers\` - List customers with filters (protected)
- \`GET /api/v1/orders\` - List orders with filters (protected)
- \`GET /api/v1/products\` - List products with filters (protected)

### Custom Events
- \`GET /api/v1/events\` - List custom events with filters (protected)
- \`POST /api/v1/events\` - Create custom event (protected)

### Health & Status
- \`GET /health\` - Service health check
- \`GET /\` - API info & endpoints

## Example Usage

### 1. Create Tenant
\`\`\`bash
curl -X POST https://xeno-app-server.onrender.com/api/v1/tenants \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"Demo","email":"demo@example.com","password":"secret123"}'
\`\`\`

### 2. Login
\`\`\`bash
curl -X POST https://xeno-app-server.onrender.com/api/v1/tenants/login \\
  -H 'Content-Type: application/json' \\
  -d '{"email":"demo@example.com","password":"secret123"}'
\`\`\`

### 3. Get Metrics (use token from login)
\`\`\`bash
curl -H "Authorization: Bearer <token>" \\
  https://xeno-app-server.onrender.com/api/v1/metrics/summary
\`\`\`

### 4. Create Custom Event
\`\`\`bash
curl -X POST https://xeno-app-server.onrender.com/api/v1/events \\
  -H "Authorization: Bearer <token>" \\
  -H 'Content-Type: application/json' \\
  -d '{"type":"checkout_started","metadata":{"cartValue":129.50}}'
\`\`\`

## Frontend Dashboard
Visit the dashboard at: [Frontend URL - https://xeno-app-web.vercel.app/]

---
Generated: ${new Date().toISOString()}
    `;
    
    res.setHeader('Content-Type', 'text/markdown');
    res.send(docsContent);
  });

  app.use('/api/v1', apiRouter);
  
  app.get('/api/v1', (_req, res) => res.json({
    name: 'Xeno API v1',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      authentication: ['/tenants', '/tenants/login'],
      shops: ['/shops', '/dev/create-shop'],
      sync: ['/sync/trigger', '/webhooks/shopify', '/dev/seed'],
      metrics: ['/metrics/summary', '/metrics/orders-by-date', '/metrics/top-customers', '/metrics/product-performance', '/metrics/customer-growth', '/metrics/order-distribution-hour', '/metrics/custom-event-counts'],
      entities: ['/customers', '/orders', '/products'],
      events: ['/events']
    },
    documentation: '/docs',
    timestamp: new Date().toISOString()
  }));

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}

export const app = createApp();
