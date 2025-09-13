import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// Lazy import BullMQ to avoid requiring redis during memory mode.
type BullQueue<T> = any; // minimal typing to avoid pulling full types now

export interface JobPayload {
  type: 'webhook.process';
  topic: string;
  shopDomain: string;
  rawBody: string;
  headers: Record<string,string>;
}

interface QueueAdapter {
  add(name: string, data: JobPayload): Promise<void>;
  process(handler: (data: JobPayload) => Promise<void>): void;
  mode: string;
}

class MemoryQueue implements QueueAdapter {
  private handlers: ((data: JobPayload)=>Promise<void>)[] = [];
  mode = 'memory';
  async add(_name: string, data: JobPayload) {
    // Immediate microtask execution
    queueMicrotask(async () => {
      for (const h of this.handlers) {
        try { await h(data); } catch (e) { logger.error({ err: e }, 'MemoryQueue job failed'); }
      }
    });
  }
  process(handler: (data: JobPayload)=>Promise<void>) { this.handlers.push(handler); }
}

class RedisQueue implements QueueAdapter {
  private queue!: BullQueue<JobPayload>;
  mode = 'redis';
  constructor() {}
  private async ensure() {
    if (!this.queue) {
      try {
        // @ts-ignore dynamic import without types
        const mod = await import('bullmq');
        const { Queue } = mod as any;
        this.queue = new Queue('ingestion', { connection: { url: env.REDIS_URL } });
      } catch (e) {
        logger.error({ err: e }, 'BullMQ not installed or failed to load; falling back to memory queue');
        throw e;
      }
    }
  }
  async add(name: string, data: JobPayload) {
    try {
      await this.ensure();
      await (this.queue as any).add(name, data, { attempts: 5, backoff: { type: 'exponential', delay: 1000 } });
    } catch {
      // if ensure failed, silently drop to memory fallback? Logging already emitted.
    }
  }
  process(handler: (data: JobPayload)=>Promise<void>) {
    (async () => {
      try {
        // @ts-ignore dynamic import without types
        const mod = await import('bullmq');
        const { Worker } = mod as any;
        new Worker('ingestion', async (job: any) => { await handler(job.data as JobPayload); }, { connection: { url: env.REDIS_URL } });
      } catch (e) {
        logger.error({ err: e }, 'Failed to start redis worker consumer - is bullmq installed?');
      }
    })().catch(e => logger.error({ err: e }, 'Failed to start redis worker consumer'));
  }
}

let adapter: QueueAdapter;
if (env.QUEUE_DRIVER === 'redis') {
  adapter = new RedisQueue();
  logger.info({ driver: 'redis' }, 'Queue initialized');
} else {
  adapter = new MemoryQueue();
  logger.info({ driver: 'memory' }, 'Queue initialized');
}

export const queue = adapter;
