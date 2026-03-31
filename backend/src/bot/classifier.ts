import type { WhatsAppMessage } from "../types";

export type MsgType =
  | "receipt"
  | "button_reply"
  | "price"
  | "pay"
  | "products"
  | "greeting"
  | "help"
  | "free_text";

export function classify(msg: WhatsAppMessage, opts?: { productKeywords?: string[] }): MsgType {
  if (msg.type === "image") return "receipt";
  if (msg.type === "interactive") return "button_reply";

  const text = msg.text?.body?.toLowerCase() ?? "";
  if (opts?.productKeywords?.some((w) => w && text.includes(w.toLowerCase()))) return "products";
  const keywords: Record<Exclude<MsgType, "receipt" | "button_reply" | "free_text">, string[]> = {
    price: ["precio", "costo", "cuanto", "cuánto", "vale", "valor"],
    pay: ["pagar", "pago", "transferir", "nequi", "bancolombia"],
    products: ["producto", "catalogo", "catálogo", "disponible"],
    greeting: ["hola", "buenas", "buen dia", "buen día", "hey"],
    help: ["ayuda", "help", "soporte"],
  };

  for (const [type, words] of Object.entries(keywords)) {
    if (words.some((w) => text.includes(w))) return type as MsgType;
  }
  return "free_text";
}
