export const ACTIVE_CAMPAIGN_KEY = "active_campaign_id";

const CHANGE_EVENT = "active-campaign-change";

export function getActiveCampaignId(): string {
  return localStorage.getItem(ACTIVE_CAMPAIGN_KEY) ?? "";
}

export function setActiveCampaignId(id: string): void {
  localStorage.setItem(ACTIVE_CAMPAIGN_KEY, id);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeActiveCampaign(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
}
