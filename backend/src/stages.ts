import { z } from "@hono/zod-openapi";

// Stages that the bot engine actively sets. Validated at API boundaries.
export const settableStageSchema = z
  .enum([
    "nuevo",
    "en_flujo",
    "flujo_terminado",
    "revision_manual",
    "pago_confirmado",
  ])
  .openapi("SettableStage");

// All stages that can appear in the DB, including legacy records.
// Referenced by OpenAPI response schemas so the frontend gets the full union type.
export const conversationStageSchema = z
  .enum([
    "nuevo",
    "en_flujo",
    "flujo_terminado",
    "revision_manual",
    "pago_confirmado",
    // Legacy — no longer set by new code but still present in existing DB records
    "flow_started",
    "confirmar_comprobante",
    "post_venta",
    "interesado",
    "esperando_comprobante",
  ])
  .openapi("ConversationStage");

export type SettableStage = z.infer<typeof settableStageSchema>;
export type ConversationStage = z.infer<typeof conversationStageSchema>;

// Named constants for bot engine code — avoids magic strings.
// TypeScript enforces these values are valid SettableStage entries.
export const STAGES = {
  nuevo: "nuevo",
  en_flujo: "en_flujo",
  flujo_terminado: "flujo_terminado",
  revision_manual: "revision_manual",
  pago_confirmado: "pago_confirmado",
} as const satisfies Record<string, SettableStage>;

// Used in DB queries that filter "flow in progress" (includes legacy name for old records)
export const FLOW_IN_PROGRESS_STAGES: ConversationStage[] = [
  STAGES.en_flujo,
  "flow_started",
];
