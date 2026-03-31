import Redis from "ioredis";
import { env } from "../config/env";
import type { ConversationState } from "../types";

const inMemory = new Map<string, ConversationState>();
const TTL_SECONDS = 3 * 24 * 3600;

const redis =
  env.REDIS_ENABLED === "true"
    ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false })
    : null;

function key(phone: string, metaPhoneNumberId?: string | null) {
  return metaPhoneNumberId ? `conv:${metaPhoneNumberId}:${phone}` : `conv:${phone}`;
}

export async function getState(phone: string, metaPhoneNumberId?: string | null): Promise<ConversationState> {
  const k = key(phone, metaPhoneNumberId);
  if (!redis)
    return (
      inMemory.get(k) ?? {
        organizationId: "",
        stage: "nuevo",
        flowId: null,
        flowName: null,
        history: [],
        whatsappInstanceId: null,
        metaPhoneNumberId: metaPhoneNumberId ?? null,
      }
    );
  const raw = await redis.get(k);
  return raw
    ? (JSON.parse(raw) as ConversationState)
    : {
        organizationId: "",
        stage: "nuevo",
        flowId: null,
        flowName: null,
        history: [],
        whatsappInstanceId: null,
        metaPhoneNumberId: metaPhoneNumberId ?? null,
      };
}

export async function setState(phone: string, state: ConversationState, metaPhoneNumberId?: string | null) {
  const k = key(phone, metaPhoneNumberId);
  if (!redis) {
    inMemory.set(k, state);
    return;
  }
  await redis.setex(k, TTL_SECONDS, JSON.stringify(state));
}
