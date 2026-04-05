import { CronJob } from "cron";
import { supabase } from "../db/supabase";
import { log } from "../logger";

const MESSAGE_RETENTION_DAYS = 90;

export async function purgeOldMessages(): Promise<void> {
  if (!supabase) return;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MESSAGE_RETENTION_DAYS);

  const { error, count } = await supabase
    .from("messages")
    .delete({ count: "exact" })
    .lt("created_at", cutoff.toISOString());

  if (error) {
    log.error({ error }, "purgeOldMessages: error al borrar mensajes antiguos");
    return;
  }

  if (count && count > 0) {
    log.info(
      { count, cutoffDays: MESSAGE_RETENTION_DAYS, cutoff: cutoff.toISOString() },
      "purgeOldMessages: mensajes eliminados por política de retención",
    );
  }
}

/** Cron diario a las 3:00 AM (hora Colombia) */
export function registerPurgeMessagesCron() {
  const job = new CronJob(
    "0 3 * * *",
    () =>
      void purgeOldMessages().catch((err) =>
        log.error({ err }, "purgeOldMessages cron failed"),
      ),
    null,
    true,
    "America/Bogota",
  );
  return job;
}
