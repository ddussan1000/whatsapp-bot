export type WhatsAppTextMessage = {
  from: string;
  type: "text";
  text?: { body?: string };
  referral?: {
    ctwa_clid?: string;
    source_id?: string;
    source_type?: string;
    source_url?: string;
  };
};

export type WhatsAppImageMessage = {
  from: string;
  type: "image";
  image?: { id?: string; mime_type?: string };
  referral?: {
    ctwa_clid?: string;
    source_id?: string;
    source_type?: string;
    source_url?: string;
  };
};

export type WhatsAppInteractiveMessage = {
  from: string;
  type: "interactive";
  interactive?: {
    type?: "button_reply" | "list_reply";
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
  referral?: {
    ctwa_clid?: string;
    source_id?: string;
    source_type?: string;
    source_url?: string;
  };
};

export type WhatsAppMessage =
  | WhatsAppTextMessage
  | WhatsAppImageMessage
  | WhatsAppInteractiveMessage;

export type ConversationState = {
  id?: string;
  organizationId: string;
  stage: string;
  flowId: string | null;
  flowName: string | null;
  whatsappInstanceId: string | null;
  metaPhoneNumberId: string | null;
  history: Array<{ role: "user" | "assistant"; content: string }>;
};
