import { CronJob } from "cron";
import { log } from "../logger";
import { processScheduledMessages } from "../queue/scheduledMessages";
import { redis } from "../cache/redis";

const CRON_LOCK_KEY = "cron:sched:lock";
const CRON_LOCK_TTL = 4; // seconds — slightly longer than cron interval (2s)

export function registerScheduledMessagesCron() {
  let running = false;

  const job = new CronJob(
    "*/2 * * * * *",
    async () => {
      if (running) return;
      running = true; // set synchronously — blocks re-entry on same instance before any await

      // Distributed lock: only one instance processes at a time
      if (redis) {
        if (redis.status !== "ready") { running = false; return; }
        const acquired = await redis.set(CRON_LOCK_KEY, "1", "EX", CRON_LOCK_TTL, "NX");
        if (!acquired) {
          running = false;
          return;
        }
      }

      processScheduledMessages()
        .catch((err) => log.error({ err }, "processScheduledMessages cron failed"))
        .finally(() => { running = false; });
    },
    null,
    true,
    "America/Bogota",
  );
  return job;
}
