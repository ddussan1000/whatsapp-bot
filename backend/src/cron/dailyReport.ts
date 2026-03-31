import { CronJob } from "cron";
import { supabase } from "../db/supabase";
import { env } from "../config/env";
import { sendMessage } from "../bot/sender";
import { textMessage } from "../bot/messages";
import { log } from "../logger";

export async function sendDailyReport() {
  if (!supabase || !env.ADMIN_PHONE) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("payments")
    .select("amount")
    .gte("validated_at", today.toISOString())
    .eq("state", "pagó");

  const total = (data ?? []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const count = data?.length ?? 0;
  await sendMessage(
    env.ADMIN_PHONE,
    textMessage(`Reporte diario: total $${total.toLocaleString("es-CO")} COP, ventas ${count}.`),
  );
}

export function registerDailyReportCron() {
  const job = new CronJob(
    "0 21 * * *",
    () => void sendDailyReport().catch((err) => log.error({ err }, "daily report failed")),
    null,
    true,
    "America/Bogota",
  );
  return job;
}
