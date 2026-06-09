import { supabase } from "../db/supabase";
import { encrypt } from "../crypto/encrypt";
import { log } from "../logger";

const GRAPH_API_VERSION = "v19.0";

/**
 * Calls POST /{wabaId}/dataset on Meta Graph API.
 * Creates dataset AND links it to the WABA in one call (idempotent on Meta's side).
 * Stores result in meta_datasets and updates whatsapp_instances.meta_dataset_id.
 * Returns the Meta dataset ID string, or null on any failure.
 */
export async function getOrCreateCapiDataset(
  wabaId: string,
  accessToken: string,
  orgId: string,
  instanceId: string,
): Promise<string | null> {
  if (!supabase) return null;

  let metaDatasetId: string;
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/dataset`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const data = (await res.json()) as {
      id?: string;
      error?: { message?: string; code?: number };
    };

    if (!res.ok || !data.id) {
      log.warn({ error: data.error, wabaId }, "CAPI setup: Meta rejected dataset creation");
      return null;
    }
    metaDatasetId = data.id;
  } catch (err) {
    log.warn({ err, wabaId }, "CAPI setup: network error calling Meta");
    return null;
  }

  try {
    // Insert dataset record; fall back to select on duplicate key (23505)
    const encryptedToken = await encrypt(accessToken);
    let dbRecordId: string;

    const { data: inserted, error: insertError } = await supabase
      .from("meta_datasets")
      .insert({
        organization_id: orgId,
        dataset_id: metaDatasetId,
        label: `CAPI - ${wabaId}`,
        access_token: encryptedToken,
      })
      .select("id")
      .single();

    if (insertError) {
      // 23505 = unique_violation — another concurrent call already inserted it
      if ((insertError as { code?: string }).code !== "23505") {
        log.warn({ error: insertError, wabaId }, "CAPI setup: failed to insert meta_dataset");
        return null;
      }
      const { data: existing } = await supabase
        .from("meta_datasets")
        .select("id")
        .eq("organization_id", orgId)
        .eq("dataset_id", metaDatasetId)
        .maybeSingle();
      if (!existing) {
        log.warn({ wabaId }, "CAPI setup: could not find existing dataset after insert conflict");
        return null;
      }
      dbRecordId = existing.id as string;
    } else {
      dbRecordId = (inserted as { id: string }).id;
    }

    // Link dataset to instance
    const { error: updateError } = await supabase
      .from("whatsapp_instances")
      .update({ meta_dataset_id: dbRecordId })
      .eq("id", instanceId)
      .eq("organization_id", orgId);

    if (updateError) {
      log.warn({ error: updateError, instanceId }, "CAPI setup: failed to link dataset to instance");
      return null;
    }

    log.info({ metaDatasetId, wabaId, instanceId }, "CAPI: dataset configured ✓");
    return metaDatasetId;
  } catch (err) {
    log.warn({ err, wabaId }, "CAPI setup: unexpected DB error");
    return null;
  }
}
