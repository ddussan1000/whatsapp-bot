import { createHash } from "node:crypto";
import { supabase } from "../db/supabase";
import { safeDecrypt } from "../crypto/encrypt";
import { log } from "../logger";

const GRAPH_API_VERSION = "v19.0";

function hashPhone(phone: string): string {
  return createHash("sha256")
    .update(phone.replace(/^\+/, ""))
    .digest("hex");
}

interface CapiPurchasePayload {
  datasetId: string;
  accessToken: string;
  phone: string;
  ctwaClid: string;
  wabaId: string;
  amount: number;
  currency: string;
  eventTime: number;
  eventId?: string | null; // payment UUID — deduplicates retries on Meta side
}

async function sendCapiPurchaseEvent(payload: CapiPurchasePayload): Promise<void> {
  const { datasetId, accessToken, phone, ctwaClid, wabaId, amount, currency, eventTime, eventId } = payload;

  const eventData: Record<string, unknown> = {
    event_name: "Purchase",
    event_time: eventTime,
    action_source: "business_messaging",
    messaging_channel: "whatsapp",
    user_data: {
      ph: [hashPhone(phone)],
      ctwa_clid: ctwaClid,
      whatsapp_business_account_id: wabaId,
    },
    custom_data: { currency, value: amount },
  };
  if (eventId) eventData.event_id = eventId;

  const body = {
    data: [eventData],
    access_token: accessToken,
  };

  let res: Response;
  try {
    res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${datasetId}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch (err) {
    log.warn({ err, datasetId }, "CAPI: network error sending Purchase event");
    return;
  }

  const data = await res.json() as { events_received?: number; error?: { message?: string; code?: number } };
  if (!res.ok || data.error) {
    log.warn({ capiError: data.error, statusCode: res.status, datasetId }, "CAPI: Purchase event rejected by Meta");
    return;
  }

  log.info({ eventsReceived: data.events_received, phone, amount, currency }, "CAPI: Purchase event sent ✓");
}

/**
 * Fire a CAPI Purchase event for a validated payment.
 * No-ops silently when: instance has no linked dataset, dataset has no token,
 * or the phone has no ctwa_clid in ad_click_logs.
 * Always fire-and-forget — caller should .catch() this.
 */
export async function tryFireCapiPurchase(
  organizationId: string,
  instanceId: string | null | undefined,
  phone: string,
  amount: number,
  currency: string,
  eventId?: string | null,
): Promise<void> {
  if (!supabase || !instanceId || amount <= 0) return;

  const { data: inst } = await supabase
    .from("whatsapp_instances")
    .select("waba_id, meta_dataset_id, meta_datasets(dataset_id, access_token)")
    .eq("id", instanceId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  const datasetRow = (
    inst as unknown as {
      waba_id?: string | null;
      meta_datasets?: { dataset_id: string; access_token: string | null };
    } | null
  )?.meta_datasets;

  const wabaId = (inst as unknown as { waba_id?: string | null } | null)?.waba_id;

  if (!datasetRow?.dataset_id || !datasetRow.access_token || !wabaId) return;

  const accessToken = await safeDecrypt(datasetRow.access_token);
  if (!accessToken) return;

  // Most recent ctwa_clid for this phone+org (ad that originated the conversation)
  const { data: clickLog } = await supabase
    .from("ad_click_logs")
    .select("ctwa_clid")
    .eq("organization_id", organizationId)
    .eq("phone", phone)
    .not("ctwa_clid", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ctwaClid = (clickLog?.ctwa_clid as string | null) ?? null;
  if (!ctwaClid) {
    log.debug({ phone, organizationId }, "CAPI: no ctwa_clid for phone, skipping Purchase event");
    return;
  }

  await sendCapiPurchaseEvent({
    datasetId: datasetRow.dataset_id,
    accessToken,
    phone,
    ctwaClid,
    wabaId,
    amount,
    currency,
    eventTime: Math.floor(Date.now() / 1000),
    eventId: eventId ?? null,
  });
}
