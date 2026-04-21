// Tipos y utilidades del FlowEditor — separados del componente para cumplir
// con react-refresh/only-export-components (Fast Refresh).

export type { FlowMessageType } from "@/types/api";
import type { FlowMessageType } from "@/types/api";

export type FlowEditorMessage = {
  id?: string;
  position: number;
  messageType: FlowMessageType;
  textContent?: string | null;
  mediaUrl?: string | null;
  filename?: string | null;
  caption?: string | null;
};

export type FlowEditorStep = {
  id?: string;
  position: number;
  delaySeconds: number;
  label?: string;
  messages: FlowEditorMessage[];
};

export type FlowEditorDraft = {
  id?: string;
  name: string;
  triggerPhrase: string;
  keywords: string[];
  noMatchBehavior: "trigger" | "ignore";
  systemPrompt?: string | null;
  isActive: boolean;
  sessionTimeoutHours: number;
  steps: FlowEditorStep[];
  receiptPendingMessage?: string;
  receiptRejectedMessage?: string;
  receiptConfirmedMessage?: string;
};

export function emptyDraft(): FlowEditorDraft {
  return {
    name: "",
    triggerPhrase: "",
    keywords: [],
    noMatchBehavior: "trigger",
    systemPrompt: "",
    isActive: true,
    sessionTimeoutHours: 24,
    steps: [],
    receiptPendingMessage: "",
    receiptRejectedMessage: "",
    receiptConfirmedMessage: "",
  };
}
