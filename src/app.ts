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
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api', apiRouter);

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}

export const app = createApp();
