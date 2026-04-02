import { log } from "../logger";

const GRAPH = "https://graph.facebook.com/v19.0";

export type AdDetails = {
  adName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
};

async function graphGet<T>(path: string, token: string): Promise<T | null> {
  const res = await fetch(`${GRAPH}/${path}&access_token=${token}`);
  if (!res.ok) return null;
  const data = (await res.json()) as T & { error?: { message: string } };
  if ((data as { error?: { message: string } }).error) return null;
  return data;
}

/**
 * Fetches ad name, campaign name and adset name from Meta Graph API.
 * Uses the instance meta_token — requires ads_read permission.
 * Fails silently so it never blocks the webhook.
 */
export async function fetchAdDetails(adId: string, token: string): Promise<AdDetails> {
  const empty: AdDetails = { adName: null, campaignId: null, campaignName: null, adsetId: null, adsetName: null };
  if (!token) return empty;

  try {
    const ad = await graphGet<{ name?: string; campaign_id?: string; adset_id?: string }>(
      `${adId}?fields=name,campaign_id,adset_id`,
      token,
    );
    if (!ad) return empty;

    const [campaign, adset] = await Promise.all([
      ad.campaign_id
        ? graphGet<{ name?: string }>(`${ad.campaign_id}?fields=name`, token)
        : null,
      ad.adset_id
        ? graphGet<{ name?: string }>(`${ad.adset_id}?fields=name`, token)
        : null,
    ]);

    return {
      adName: ad.name ?? null,
      campaignId: ad.campaign_id ?? null,
      campaignName: campaign?.name ?? null,
      adsetId: ad.adset_id ?? null,
      adsetName: adset?.name ?? null,
    };
  } catch (err) {
    log.warn({ err, adId }, "fetchAdDetails: failed — token may lack ads_read permission");
    return empty;
  }
}
