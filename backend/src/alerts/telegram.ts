import { env } from "../config/env";

export async function alertAdmin(msg: string, level: "warn" | "error" = "error") {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const emoji = level === "error" ? "🔴" : "🟡";
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: `${emoji} ${msg}`,
    }),
  });
}
