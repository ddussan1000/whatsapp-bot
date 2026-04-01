import type { WhatsAppMessage } from "../types";

export type MsgType =
  | "image"
  | "button_reply"
  | "free_text";

export function classify(msg: WhatsAppMessage): MsgType {
  if (msg.type === "image") return "image";
  if (msg.type === "interactive") return "button_reply";
  return "free_text";
}
