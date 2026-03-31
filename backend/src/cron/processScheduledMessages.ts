import { CronJob } from "cron";
import { log } from "../logger";
import { processScheduledMessages } from "../bot/flowEngine";

export function registerScheduledMessagesCron() {
  // Run every minute to send pending scheduled flow messages
  const job = new CronJob(
    "* * * * *",
    () =>
      void processScheduledMessages().catch((err) =>
        log.error({ err }, "processScheduledMessages cron failed"),
      ),
    null,
    true,
    "America/Bogota",
  );
  return job;
}
