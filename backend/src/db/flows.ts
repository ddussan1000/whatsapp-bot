import { supabase } from "./supabase";

export type Flow = {
  id: string;
  organization_id: string;
  name: string;
  trigger_phrase: string;
  trigger_first_word: string;
  keywords: string[];
  no_match_behavior: "trigger" | "ignore";
  system_prompt: string | null;
  is_active: boolean;
};

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,!?¿¡;:'"()\-\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractFirstWord(input: string) {
  const norm = normalize(input);
  return norm.split(" ").filter(Boolean)[0] ?? "hola";
}

export function matchesFlowTrigger(message: string, flow: Pick<Flow, "trigger_first_word" | "keywords">) {
  const normalized = normalize(message);
  if (!normalized) return false;
  const words = normalized.split(" ");
  if (flow.trigger_first_word && words.includes(flow.trigger_first_word.toLowerCase())) return true;
  return (flow.keywords ?? []).some((kw) => kw && normalized.includes(normalize(kw)));
}

export async function getFlowById(flowId: string) {
  if (!supabase) return null;
  const { data } = await supabase
    .from("flows")
    .select("id, organization_id, name, trigger_phrase, trigger_first_word, keywords, no_match_behavior, system_prompt, is_active")
    .eq("id", flowId)
    .maybeSingle<Flow>();
  return data ?? null;
}

export async function findFlowByCtwaClid(organizationId: string, ctwaClid: string) {
  if (!supabase) return null;
  const { data: ref } = await supabase
    .from("flow_referrals")
    .select("flow_id")
    .eq("organization_id", organizationId)
    .eq("ctwa_clid", ctwaClid)
    .maybeSingle<{ flow_id: string }>();
  if (!ref?.flow_id) return null;
  return await getFlowById(ref.flow_id);
}
