import dotenv from 'dotenv';

dotenv.config();

function buildDatabaseUrl(): string {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0) {
    return process.env.DATABASE_URL;
  }
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = process.env.POSTGRES_PORT || '5432';
  const user = process.env.POSTGRES_USER || 'xeno_app';
  const pass = process.env.POSTGRES_PASSWORD || 'xeno_pass';
  const db = process.env.POSTGRES_DB || 'xeno';
  return `postgresql://${user}:${pass}@${host}:${port}/${db}`;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '4000', 10),
  DATABASE_URL: process.env.DATABASE_URL || buildDatabaseUrl(),
  JWT_SECRET: process.env.JWT_SECRET || 'devsecret',
  JWT_EXP_HOURS: parseInt(process.env.JWT_EXP_HOURS || '12', 10),
  SYNC_INTERVAL_CRON: process.env.SYNC_INTERVAL_CRON || '*/15 * * * *',
  SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY || '',
  SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET || '',
  SHOPIFY_SCOPES: (process.env.SHOPIFY_SCOPES || 'read_orders,read_products,read_customers').split(','),
  SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL || 'http://localhost:4000',
  SHOPIFY_API_VERSION: process.env.SHOPIFY_API_VERSION || '2024-04',
  DEV_FAKE_SHOPIFY: process.env.DEV_FAKE_SHOPIFY === 'true',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  SCHEDULER_ENABLED: process.env.SCHEDULER_ENABLED !== 'false'
  ,QUEUE_DRIVER: process.env.QUEUE_DRIVER || 'memory' // 'memory' | 'redis'
  ,REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379'
  ,WEBHOOK_SKIP_HMAC: process.env.WEBHOOK_SKIP_HMAC === 'true' || process.env.DEV_FAKE_SHOPIFY === 'true'
  ,DEV_DEFAULT_SHOP_DOMAIN: process.env.DEV_DEFAULT_SHOP_DOMAIN || 'dev-shop.example.myshopify.com'
};
