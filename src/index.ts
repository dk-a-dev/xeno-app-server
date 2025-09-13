import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { apiRouter } from './routes/index.js';
import { startScheduler } from './services/scheduler.js';

const app = express();
app.use(helmet());
app.use(cors({ origin: '*'}));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api', apiRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(env.PORT, () => {
  logger.info(`Server listening on port ${env.PORT}`);
  startScheduler();
});
