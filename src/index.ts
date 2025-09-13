import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { startScheduler } from './services/scheduler.js';
import { app } from './app.js';

app.listen(env.PORT, () => {
  logger.info(`Server listening on port ${env.PORT}`);
  if (env.SCHEDULER_ENABLED) {
    startScheduler();
  } else {
    logger.info('Scheduler disabled via SCHEDULER_ENABLED=false');
  }
});
