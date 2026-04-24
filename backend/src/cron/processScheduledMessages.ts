import { CronJob } from "cron";
import { log } from "../logger";
import { processScheduledMessages } from "../queue/scheduledMessages";
import { processDatabaseScheduledMessages } from "../bot/flowEngine";

export function registerScheduledMessagesCron() {
  let running = false;

  const job = new CronJob(
    "*/2 * * * * *",
    () => {
      if (running) return;
      running = true;
      Promise.all([
        processScheduledMessages(),          // Redis worker (new)
        processDatabaseScheduledMessages(),  // DB fallback for pre-migration rows
      ])
        .catch((err) => log.error({ err }, "processScheduledMessages cron failed"))
        .finally(() => { running = false; });
    },
    null,
    true,
    "America/Bogota",
  );
  return job;
}
