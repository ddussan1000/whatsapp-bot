import type { components } from "./__gen__/api_v1.d.ts";

export type ConversationStage = components["schemas"]["ConversationStage"];
export type SettableStage = components["schemas"]["SettableStage"];

// Display labels for every known stage.
// TypeScript errors here if a stage is added to the backend and types are regenerated.
export const STAGE_LABELS: Record<ConversationStage, string> = {
  // Active stages
  nuevo: "Nuevo",
  en_flujo: "En flujo",
  flujo_terminado: "Flujo terminado",
  revision_manual: "Revisión manual",
  pago_confirmado: "Pago confirmado",
  // Legacy stages (old DB records — no longer set by the bot)
  flow_started: "En flujo",
  confirmar_comprobante: "En revisión",
  post_venta: "Post venta",
  interesado: "Interesado",
  esperando_comprobante: "Esperando comprobante",
};

// Color classes for StatusBadge
export const STAGE_COLORS: Record<ConversationStage, string> = {
  nuevo: "badge badge-gray",
  en_flujo: "badge badge-indigo",
  flujo_terminado: "badge badge-slate",
  revision_manual: "badge badge-purple",
  pago_confirmado: "badge badge-green",
  // Legacy
  flow_started: "badge badge-indigo",
  confirmar_comprobante: "badge badge-purple",
  post_venta: "badge badge-slate",
  interesado: "badge badge-blue",
  esperando_comprobante: "badge badge-amber",
};

// Active stages available for filtering/manual assignment in the dashboard
export const ACTIVE_STAGE_OPTIONS: { value: SettableStage; label: string }[] = [
  { value: "nuevo", label: "Nuevo" },
  { value: "en_flujo", label: "En flujo" },
  { value: "flujo_terminado", label: "Flujo terminado" },
  { value: "revision_manual", label: "Revisión manual" },
  { value: "pago_confirmado", label: "Pago confirmado" },
];

export function stageLabel(stage: string): string {
  return (
    STAGE_LABELS[stage as ConversationStage] ??
    stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
