import { Queue } from "bullmq";
import Redis from "ioredis";
import { env } from "../config/env";
import { log } from "../logger";
import type { WhatsAppMessage, WhatsAppReferral } from "../types";

export type MessageJobData = {
  organizationId: string;
  metaPhoneNumberId: string;
  phone: string;
  contactName: string | null;
  referral: WhatsAppReferral | null;
  msg: WhatsAppMessage;
};

// BullMQ requires maxRetriesPerRequest: null
const connection = env.REDIS_ENABLED === "true"
  ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, enableOfflineQueue: false })
  : null;

export const messageQueue = connection
  ? new Queue<MessageJobData>("msgProcess", {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 500,
        removeOnFail: 1000,
      },
    })
  : null;

if (messageQueue) {
  log.info("messageQueue: BullMQ activo");
}
