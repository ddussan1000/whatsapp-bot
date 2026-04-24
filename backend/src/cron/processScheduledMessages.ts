import { CronJob } from "cron";
import { log } from "../logger";
import { processScheduledMessages } from "../queue/scheduledMessages";

export function registerScheduledMessagesCron() {
  let running = false;

  const job = new CronJob(
    "*/2 * * * * *",
    () => {
      if (running) return;
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
