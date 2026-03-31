export const ACTIVE_PRODUCT_KEY = "active_product_id";

const CHANGE_EVENT = "active-product-change";

export function getActiveProductId(): string {
  return localStorage.getItem(ACTIVE_PRODUCT_KEY) ?? "";
}

export function setActiveProductId(id: string): void {
  localStorage.setItem(ACTIVE_PRODUCT_KEY, id);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeActiveProduct(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
}
