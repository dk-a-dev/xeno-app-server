import dotenv from 'dotenv';

dotenv.config();

// Allow composing DATABASE_URL from discrete POSTGRES_* variables if not provided.
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
  DATABASE_URL: buildDatabaseUrl(),
  JWT_SECRET: process.env.JWT_SECRET || 'devsecret',
  SYNC_INTERVAL_CRON: process.env.SYNC_INTERVAL_CRON || '*/15 * * * *',
  SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY || '',
  SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET || '',
};
