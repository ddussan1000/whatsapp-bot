import { CronJob } from "cron";
import { log } from "../logger";
import { processScheduledMessages } from "../bot/flowEngine";

export function registerScheduledMessagesCron() {
  let running = false;

  // Run every 10 seconds to respect sub-minute step delays
  const job = new CronJob(
    "*/5 * * * * *",
    () => {
      if (running) return; // skip if previous execution is still in progress
      running = true;
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
