import { askAssistant } from "../ai/assistant";

export async function askHaiku(text: string, systemOverride?: string | null) {
  return askAssistant(text, systemOverride);
}
