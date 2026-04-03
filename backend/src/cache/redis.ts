import Redis from "ioredis";
import { env } from "../config/env";
import type { ConversationState } from "../types";

class LRUMap<K, V> {
  private map = new Map<K, V>();
  constructor(private readonly maxSize: number) {}

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const val = this.map.get(key)!;
    // Move to end (most recently used)
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.maxSize) {
      // Evict least recently used (first entry)
      this.map.delete(this.map.keys().next().value!);
    }
    this.map.set(key, value);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }
}

const inMemory = new LRUMap<string, ConversationState>(10_000);
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

const dedupMemory = new Map<string, number>(); // key -> expiry timestamp

// Dedup helper: returns true if key already existed (duplicate), false if it's new
export async function isDuplicate(key: string, ttlSeconds: number): Promise<boolean> {
  if (redis) {
    try {
      // SET key 1 EX ttl NX — returns "OK" if set, null if already existed
      const result = await redis.set(key, "1", "EX", ttlSeconds, "NX");
      return result === null; // null means key already existed
    } catch {
      // Redis error — fall through to memory
    }
  }
  // In-memory fallback: use a simple Map with expiry timestamps
  const existing = dedupMemory.get(key);
  const now = Date.now();
  if (existing && existing > now) return true; // duplicate
  dedupMemory.set(key, now + ttlSeconds * 1000);
  return false;
}
