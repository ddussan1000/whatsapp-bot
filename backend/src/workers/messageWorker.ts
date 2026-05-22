import { Worker } from "bullmq";
import Redis from "ioredis";
import { env } from "../config/env";
import { log } from "../logger";
import { processMessageJob } from "../bot/messageProcessor";
import type { MessageJobData } from "../queue/messageQueue";

const connection = env.REDIS_ENABLED === "true"
  ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, enableOfflineQueue: false })
  : null;

export function startMessageWorker() {
  if (!connection) {
    log.warn("messageWorker: Redis no disponible, worker inactivo");
    return null;
  }

  const worker = new Worker<MessageJobData>(
    "msgProcess",
    async (job) => {
      await processMessageJob(job.data);
    },
    {
      connection,
      concurrency: 10,
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  );

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, phone: job?.data?.phone, err }, "messageWorker: job falló");
  });

  worker.on("error", (err) => {
    log.error({ err }, "messageWorker: error de conexión (no fatal)");
  });

  log.info("messageWorker: iniciado (concurrency=10)");
  return worker;
}
