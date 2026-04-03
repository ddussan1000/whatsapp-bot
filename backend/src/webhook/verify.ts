import type { Context } from "hono";
import { supabase } from "../db/supabase";

export async function verifyWebhook(c: Context) {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return c.text("forbidden", 403);
  }

  // Check if the token matches any organization's verify_token
  if (supabase) {
    const { data } = await supabase
      .from("organizations")
      .select("id")
      .eq("verify_token", token)
      .limit(1)
      .maybeSingle();

    if (data) {
      return c.text(challenge);
    }
  }

  return c.text("forbidden", 403);
}
