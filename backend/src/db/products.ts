import { supabase } from "./supabase";

export type Product = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  is_active: boolean;
  system_prompt: string;
  dispatch_keywords: string;
  config: Record<string, unknown>;
};

function parseKeywords(raw: string) {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function findProductByCtwaClid(organizationId: string, ctwaClid: string) {
  if (!supabase) return null;
  const { data: ref } = await supabase
    .from("product_referrals")
    .select("product_id")
    .eq("organization_id", organizationId)
    .eq("ctwa_clid", ctwaClid)
    .maybeSingle();
  if (!ref?.product_id) return null;
  const { data: product } = await supabase
    .from("products")
    .select("id, organization_id, name, slug, is_active, system_prompt, dispatch_keywords, config")
    .eq("id", ref.product_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return product ?? null;
}

export async function findProductById(organizationId: string, productId: string) {
  if (!supabase) return null;
  const { data } = await supabase
    .from("products")
    .select("id, organization_id, name, slug, is_active, system_prompt, dispatch_keywords, config")
    .eq("id", productId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data ?? null;
}

export async function findProductByText(organizationId: string, text: string) {
  if (!supabase) return null;
  const normalized = text.toLowerCase();
  const { data } = await supabase
    .from("products")
    .select("id, organization_id, name, slug, is_active, system_prompt, dispatch_keywords, config")
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  const products = data ?? [];
  for (const product of products) {
    const words = parseKeywords(product.dispatch_keywords ?? "");
    if (words.length > 0 && words.some((w) => normalized.includes(w))) return product;
  }
  return null;
}

export function getProductKeywords(product: { dispatch_keywords?: string | null }) {
  return parseKeywords(product.dispatch_keywords ?? "");
}

export async function findCampaignIdByProductId(organizationId: string, productId: string) {
  if (!supabase) return null;
  const { data } = await supabase
    .from("campaigns")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("product_id", productId)
    .maybeSingle();
  return data?.id ?? null;
}

