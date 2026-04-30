import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  FileText,
  ImageIcon,
  Info,
  Library,
  MapPin,
  Megaphone,
  Mic,
  Pencil,
  Send,
  ShoppingCart,
  Sparkles,
  ThumbsUp,
  User,
  Video,
  PlayCircle,
  RefreshCw,
  StopCircle,
  Workflow,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "../components/ui/skeleton";
import { StatusBadge } from "../components/StatusBadge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  useConversationQuery,
  useCreatePaymentMutation,
  useFlowV2Query,
  useFlowsV2Query,
  usePaymentsQuery,
  useSendConversationMessageMutation,
  useSendMediaFromLibraryMutation,
  useStopFlowMutation,
  useTriggerFlowMutation,
  useUpdateConversationStageMutation,
  useUpdatePaymentAmountMutation,
  useUpdatePaymentStateMutation,
} from "../lib/hooks";
import { api } from "../lib/api";
import type { ChatMessage, Conversation } from "../types/api";
import {
  MediaPickerModal,
  type MediaPickerResult,
} from "../components/ui/media-picker-modal";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatPhone(phone: string) {
  return phone.startsWith("57") && phone.length === 12
    ? `+57 ${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`
    : `+${phone}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PAGE_SIZE = 50;

// ── Message content types ──────────────────────────────────────────────────

type MsgContent =
  | { kind: "text"; text: string }
  | { kind: "image"; href: string | null; caption: string | null }
  | { kind: "video"; href: string | null; caption: string | null }
  | { kind: "audio"; href: string | null; isVoice: boolean }
  | {
      kind: "document";
      href: string | null;
      filename: string | null;
      caption: string | null;
    }
  | { kind: "sticker"; href: string | null }
  | {
      kind: "location";
      lat: number;
      lng: number;
      name: string | null;
      address: string | null;
    }
  | { kind: "contacts"; names: string[] }
  | { kind: "reaction" }
  | { kind: "interactive_reply"; text: string }
  | { kind: "button"; text: string }
  | { kind: "order" }
  | { kind: "system"; text: string }
  | { kind: "unsupported" };

function parseContent(m: ChatMessage): MsgContent {
  const p = (m.payload as Record<string, unknown> | null | undefined) ?? {};

  switch (m.message_type) {
    case "text": {
      const body =
        m.text_body?.trim() ||
        (p.text as { body?: string } | undefined)?.body?.trim();
      return { kind: "text", text: body ?? "" };
    }
    case "image": {
      const img = p.image as { link?: string; caption?: string } | undefined;
      return {
        kind: "image",
        href: m.media_url ?? img?.link ?? null,
        caption: img?.caption?.trim() ?? null,
      };
    }
    case "video": {
      const vid = p.video as { link?: string; caption?: string } | undefined;
      return {
        kind: "video",
        href: m.media_url ?? vid?.link ?? null,
        caption: vid?.caption?.trim() ?? null,
      };
    }
    case "audio": {
      const aud = p.audio as { url?: string; voice?: boolean } | undefined;
      return {
        kind: "audio",
        href: m.media_url ?? aud?.url ?? null,
        isVoice: aud?.voice === true,
      };
    }
    case "document": {
      const doc = p.document as
        | { link?: string; filename?: string; caption?: string }
        | undefined;
      return {
        kind: "document",
        href: m.media_url ?? doc?.link ?? null,
        filename: doc?.filename ?? null,
        caption: doc?.caption?.trim() ?? null,
      };
    }
    case "sticker": {
      const stk = p.sticker as { url?: string } | undefined;
      return { kind: "sticker", href: m.media_url ?? stk?.url ?? null };
    }
    case "location": {
      const loc = p.location as
        | {
            latitude?: number;
            longitude?: number;
            name?: string;
            address?: string;
          }
        | undefined;
      return {
        kind: "location",
        lat: loc?.latitude ?? 0,
        lng: loc?.longitude ?? 0,
        name: loc?.name ?? null,
        address: loc?.address ?? null,
      };
    }
    case "contacts": {
      const contacts = p.contacts as
        | Array<{ name?: { formatted_name?: string } }>
        | undefined;
      const names = (contacts ?? [])
        .map((c) => c?.name?.formatted_name ?? "Contacto")
        .filter(Boolean);
      return { kind: "contacts", names };
    }
    case "reaction":
      return { kind: "reaction" };
    case "interactive": {
      const inter = p.interactive as
        | {
            type?: string;
            button_reply?: { title?: string };
            list_reply?: { title?: string; description?: string };
            nfm_reply?: { response_json?: string };
            body?: { text?: string };
          }
        | undefined;
      const text =
        inter?.button_reply?.title ??
        inter?.list_reply?.title ??
        inter?.body?.text ??
        "Respuesta interactiva";
      return { kind: "interactive_reply", text };
    }
    case "button": {
      const btn = p.button as { text?: string } | undefined;
      return { kind: "button", text: btn?.text ?? m.text_body ?? "Botón" };
    }
    case "order":
      return { kind: "order" };
    case "system": {
      const sys = p.system as { body?: string } | undefined;
      return { kind: "system", text: sys?.body ?? "Mensaje del sistema" };
    }
    default:
      return { kind: "unsupported" };
  }
}

// ── DeliveryIcon ──────────────────────────────────────────────────────────

function DeliveryIcon({ status }: { status: string | null | undefined }) {
  if (status === "failed")
    return <AlertCircle size={14} className="text-rose-400 shrink-0" />;
  if (status === "read")
    return (
      <CheckCheck
        size={14}
        className="text-sky-300 dark:text-sky-400 shrink-0"
      />
    );
  if (status === "delivered")
    return (
      <CheckCheck size={14} className="text-primary-foreground/55 shrink-0" />
    );
  if (status === "sent")
    return <Check size={14} className="text-primary-foreground/55 shrink-0" />;
  return <Clock size={13} className="text-primary-foreground/45 shrink-0" />;
}

// ── ChatBubble ─────────────────────────────────────────────────────────────

function ImagePreviewModal({
  src,
  open,
  onClose,
}: {
  src: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0">
        <div className="flex items-center justify-center bg-muted/40 p-4">
          <img
            src={src}
            alt="Comprobante"
            className="max-w-full max-h-[70vh] object-contain rounded-md"
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t">
          <a href={src} download target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline">
              Descargar
            </Button>
          </a>
          <a href={src} target="_blank" rel="noreferrer">
            <Button size="sm">Abrir original</Button>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── BubbleTimestamp ────────────────────────────────────────────────────────

function BubbleTimestamp({ m, isOut }: { m: ChatMessage; isOut: boolean }) {
  if (!m.created_at) return null;
  return (
    <div
      className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] leading-none ${
        isOut ? "text-primary-foreground/60" : "text-muted-foreground"
      }`}
    >
      {m.delivery_status === "failed" && (
        <span className="font-semibold text-rose-300 dark:text-rose-400">
          No entregado
        </span>
      )}
      <span>{formatTime(m.created_at)}</span>
      {isOut && <DeliveryIcon status={m.delivery_status} />}
    </div>
  );
}

// ── BubbleShell ────────────────────────────────────────────────────────────

function BubbleShell({
  isOut,
  children,
  noPadding = false,
}: {
  isOut: boolean;
  children: React.ReactNode;
  noPadding?: boolean;
}) {
  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative max-w-[72%] rounded-2xl text-sm shadow-sm ${
          noPadding ? "overflow-hidden" : "px-3.5 py-2.5"
        } ${
          isOut
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-card border"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

// ── ChatBubble ─────────────────────────────────────────────────────────────

function ChatBubble({ m }: { m: ChatMessage }) {
  const isOut = m.direction === "outbound";
  const content = parseContent(m);
  const [imgError, setImgError] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // System messages render as centered notices, not bubbles
  if (content.kind === "system") {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
          {content.text}
        </span>
      </div>
    );
  }

  // Reactions render as small pill
  if (content.kind === "reaction") {
    return (
      <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
        <span
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
            isOut ? "bg-primary/5" : "bg-muted"
          } text-muted-foreground`}
        >
          <ThumbsUp size={11} className="shrink-0" />
          Reacción
        </span>
      </div>
    );
  }

  if (content.kind === "image") {
    return (
      <BubbleShell isOut={isOut} noPadding={Boolean(content.href && !imgError)}>
        {content.href && !imgError && (
          <>
            <ImagePreviewModal
              src={content.href}
              open={previewOpen}
              onClose={() => setPreviewOpen(false)}
            />
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="block cursor-zoom-in"
            >
              <img
                src={content.href}
                alt="Imagen"
                className="max-h-64 w-auto object-cover hover:opacity-90 transition-opacity"
                onError={() => setImgError(true)}
              />
            </button>
          </>
        )}
        {(!content.href || imgError) && (
          <div
            className={`flex items-center gap-1.5 text-xs px-3.5 py-2.5 ${isOut ? "text-primary-foreground/70" : "text-muted-foreground"}`}
          >
            <ImageIcon size={14} />
            Imagen
          </div>
        )}
        {content.caption && (
          <p
            className={`px-3.5 py-2 text-sm whitespace-pre-wrap ${isOut ? "text-primary-foreground" : ""}`}
          >
            {content.caption}
          </p>
        )}
        <div className="px-3.5 pb-2">
          <BubbleTimestamp m={m} isOut={isOut} />
        </div>
      </BubbleShell>
    );
  }

  if (content.kind === "sticker") {
    return (
      <BubbleShell isOut={isOut} noPadding={Boolean(content.href && !imgError)}>
        {content.href && !imgError ? (
          <>
            <img
              src={content.href}
              alt="Sticker"
              className="h-24 w-24 object-contain"
              onError={() => setImgError(true)}
            />
            <div className="px-3.5 pb-2.5 pt-1">
              <BubbleTimestamp m={m} isOut={isOut} />
            </div>
          </>
        ) : (
          <>
            <div
              className={`flex items-center gap-1.5 text-xs ${isOut ? "text-primary-foreground/70" : "text-muted-foreground"}`}
            >
              <Sparkles size={13} className="shrink-0" aria-hidden="true" />
              <span>Sticker</span>
            </div>
            <BubbleTimestamp m={m} isOut={isOut} />
          </>
        )}
      </BubbleShell>
    );
  }

  if (content.kind === "video") {
    return (
      <BubbleShell isOut={isOut}>
        <div
          className={`flex items-center gap-1.5 rounded-lg p-2 text-xs mb-1.5 ${isOut ? "bg-primary-foreground/10" : "bg-muted"}`}
        >
          <Video
            size={14}
            className={
              isOut ? "text-primary-foreground/80" : "text-muted-foreground"
            }
          />
          {content.href ? (
            <a
              href={content.href}
              target="_blank"
              rel="noreferrer"
              className={`underline underline-offset-2 ${isOut ? "text-primary-foreground" : "text-foreground"}`}
            >
              Ver video
            </a>
          ) : (
            <span
              className={
                isOut ? "text-primary-foreground/70" : "text-muted-foreground"
              }
            >
              Video adjunto
            </span>
          )}
        </div>
        {content.caption && (
          <p className="whitespace-pre-wrap leading-snug mb-1.5">
            {content.caption}
          </p>
        )}
        <BubbleTimestamp m={m} isOut={isOut} />
      </BubbleShell>
    );
  }

  if (content.kind === "audio") {
    return (
      <BubbleShell isOut={isOut}>
        <div className="flex flex-col gap-1.5">
          <div
            className={`flex items-center gap-1.5 text-xs ${isOut ? "text-primary-foreground/70" : "text-muted-foreground"}`}
          >
            <Mic size={13} />
            <span>{content.isVoice ? "Nota de voz" : "Audio"}</span>
          </div>
          {content.href ? (
            <audio
              controls
              src={content.href}
              className="h-8 w-48 max-w-full"
              style={{ colorScheme: isOut ? "dark" : "light" }}
            />
          ) : (
            <span
              className={`text-xs ${isOut ? "text-primary-foreground/50" : "text-muted-foreground/60"}`}
            >
              (URL expirada)
            </span>
          )}
        </div>
        <BubbleTimestamp m={m} isOut={isOut} />
      </BubbleShell>
    );
  }

  if (content.kind === "document") {
    const label = content.filename ?? "Documento";
    return (
      <BubbleShell isOut={isOut}>
        <div
          className={`flex items-center gap-1.5 rounded-lg p-2 text-xs mb-1.5 ${isOut ? "bg-primary-foreground/10" : "bg-muted"}`}
        >
          <FileText
            size={14}
            className={
              isOut ? "text-primary-foreground/80" : "text-muted-foreground"
            }
          />
          {content.href ? (
            <a
              href={content.href}
              target="_blank"
              rel="noreferrer"
              className={`underline underline-offset-2 truncate max-w-48 ${isOut ? "text-primary-foreground" : "text-foreground"}`}
            >
              {label}
            </a>
          ) : (
            <span
              className={`truncate max-w-48 ${isOut ? "text-primary-foreground/70" : "text-muted-foreground"}`}
            >
              {label}
            </span>
          )}
        </div>
        {content.caption && (
          <p className="whitespace-pre-wrap leading-snug mb-1.5">
            {content.caption}
          </p>
        )}
        <BubbleTimestamp m={m} isOut={isOut} />
      </BubbleShell>
    );
  }

  if (content.kind === "location") {
    const mapsUrl = `https://www.google.com/maps?q=${content.lat},${content.lng}`;
    const label =
      content.name ??
      content.address ??
      `${content.lat.toFixed(5)}, ${content.lng.toFixed(5)}`;
    return (
      <BubbleShell isOut={isOut}>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 mb-1"
        >
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isOut ? "bg-primary-foreground/15" : "bg-muted"}`}
          >
            <MapPin
              size={14}
              className={
                isOut ? "text-primary-foreground/80" : "text-muted-foreground"
              }
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span
              className={`text-xs font-medium truncate max-w-48 underline underline-offset-2 ${isOut ? "text-primary-foreground" : "text-foreground"}`}
            >
              {label}
            </span>
            {content.address && content.name && (
              <span
                className={`text-[10px] truncate max-w-48 ${isOut ? "text-primary-foreground/60" : "text-muted-foreground"}`}
              >
                {content.address}
              </span>
            )}
          </div>
        </a>
        <BubbleTimestamp m={m} isOut={isOut} />
      </BubbleShell>
    );
  }

  if (content.kind === "contacts") {
    return (
      <BubbleShell isOut={isOut}>
        <div className="flex flex-col gap-1 mb-1">
          {content.names.length > 0 ? (
            content.names.map((name, i) => (
              <div
                key={i}
                className={`flex items-center gap-1.5 text-xs ${isOut ? "text-primary-foreground/80" : ""}`}
              >
                <User
                  size={12}
                  className={
                    isOut
                      ? "text-primary-foreground/60"
                      : "text-muted-foreground"
                  }
                />
                <span>{name}</span>
              </div>
            ))
          ) : (
            <div
              className={`flex items-center gap-1.5 text-xs ${isOut ? "text-primary-foreground/70" : "text-muted-foreground"}`}
            >
              <User size={12} />
              Contacto compartido
            </div>
          )}
        </div>
        <BubbleTimestamp m={m} isOut={isOut} />
      </BubbleShell>
    );
  }

  if (content.kind === "interactive_reply") {
    return (
      <BubbleShell isOut={isOut}>
        <p className="whitespace-pre-wrap wrap-break-word leading-snug">
          {content.text}
        </p>
        <BubbleTimestamp m={m} isOut={isOut} />
      </BubbleShell>
    );
  }

  if (content.kind === "button") {
    return (
      <BubbleShell isOut={isOut}>
        <p className="whitespace-pre-wrap wrap-break-word leading-snug">
          {content.text}
        </p>
        <BubbleTimestamp m={m} isOut={isOut} />
      </BubbleShell>
    );
  }

  if (content.kind === "order") {
    return (
      <BubbleShell isOut={isOut}>
        <div
          className={`flex items-center gap-1.5 text-xs ${isOut ? "text-primary-foreground/70" : "text-muted-foreground"}`}
        >
          <ShoppingCart size={13} className="shrink-0" />
          <span>Pedido realizado</span>
        </div>
        <BubbleTimestamp m={m} isOut={isOut} />
      </BubbleShell>
    );
  }

  if (content.kind === "unsupported") {
    return (
      <BubbleShell isOut={isOut}>
        <span
          className={`text-xs italic ${isOut ? "text-primary-foreground/50" : "text-muted-foreground/60"}`}
        >
          Tipo de mensaje no soportado
        </span>
        <BubbleTimestamp m={m} isOut={isOut} />
      </BubbleShell>
    );
  }

  // Default: text (content.kind === "text")
  const text = content.kind === "text" ? content.text : "";
  return (
    <BubbleShell isOut={isOut}>
      {text ? (
        <p className="whitespace-pre-wrap wrap-break-word leading-snug">
          {text}
        </p>
      ) : (
        <span
          className={`text-xs italic ${isOut ? "text-primary-foreground/50" : "text-muted-foreground/60"}`}
        >
          Mensaje vacío
        </span>
      )}
      <BubbleTimestamp m={m} isOut={isOut} />
    </BubbleShell>
  );
}

// ── DaySeparator ───────────────────────────────────────────────────────────

function DaySeparator({ day }: { day: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-border" />
      <span className="rounded-full border bg-background px-3 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
        {day}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

// ── ClientInfoModal ────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

const STAGE_OPTIONS = [
  { value: "en_flujo", label: "En flujo" },
  { value: "flujo_terminado", label: "Flujo terminado" },
  { value: "pago_confirmado", label: "Pago confirmado" },
  { value: "revision_manual", label: "Revisión manual" },
];

const PAYMENT_STATE_OPTIONS = [
  { value: "pending_manual_review", label: "Pendiente revisión" },
  { value: "validated", label: "Validado" },
  { value: "rejected", label: "Rechazado" },
];

const PAYMENT_STATE_COLORS: Record<string, string> = {
  pending_manual_review: "text-amber-600 bg-amber-500/10",
  validated: "text-green-600 bg-green-500/10",
  rejected: "text-red-600 bg-red-500/10",
};

function PaymentStateLabel({ state }: { state: string }) {
  const opt = PAYMENT_STATE_OPTIONS.find((o) => o.value === state);
  const color = PAYMENT_STATE_COLORS[state] ?? "text-muted-foreground bg-muted";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${color}`}
    >
      {opt?.label ?? state}
    </span>
  );
}

function ClientInfoModal({
  open,
  onClose,
  conversation,
  onStageChange,
  stageChangePending,
}: {
  open: boolean;
  onClose: () => void;
  conversation: Conversation | undefined;
  onStageChange: (stage: string) => void;
  stageChangePending: boolean;
}) {
  const ad = conversation?.ad_source;
  const currentStage = conversation ? String(conversation.stage) : "";
  const knownStage = STAGE_OPTIONS.some((o) => o.value === currentStage);
  const updatePaymentState = useUpdatePaymentStateMutation();
  const updatePaymentAmount = useUpdatePaymentAmountMutation();
  const createPayment = useCreatePaymentMutation();
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);
  const [amountDraft, setAmountDraft] = useState("");
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newAmount, setNewAmount] = useState("");
  const [newCurrency, setNewCurrency] = useState("COP");
  const [newState, setNewState] = useState("validated");
  const { data: paymentsData } = usePaymentsQuery(
    conversation?.phone
      ? { phone: conversation.phone, pageSize: 20 }
      : undefined
  );
  const payments = paymentsData?.items ?? [];
  const displayName =
    conversation?.contact_name ??
    (conversation ? formatPhone(conversation.phone) : "");
  const initials =
    displayName
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] sm:max-h-[70dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalles del cliente</DialogTitle>
        </DialogHeader>

        {!conversation ? (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-40" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-5 py-1">
            {/* Contact header */}
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-base">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm leading-tight truncate">
                  {displayName}
                </p>
                {conversation.contact_name && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatPhone(conversation.phone)}
                  </p>
                )}
                {conversation.flow_name && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <Workflow size={11} className="shrink-0" />
                    <span className="truncate">{conversation.flow_name}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Stage update — prominent */}
            <div className="rounded-xl border bg-muted/30 p-3 flex flex-col gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Estado de la conversación
              </p>
              <Select
                value={knownStage ? currentStage : ""}
                onValueChange={(v) => {
                  if (v) onStageChange(v);
                }}
                disabled={stageChangePending}
              >
                <SelectTrigger className="h-9 text-sm bg-background">
                  <SelectValue placeholder={currentStage} />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                  {!knownStage && (
                    <SelectItem value={currentStage} disabled>
                      {currentStage}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {stageChangePending && (
                <p className="text-xs text-muted-foreground">Actualizando…</p>
              )}
            </div>

            {/* Timestamps */}
            <div className="flex flex-col gap-3">
              {conversation.started_at && (
                <InfoRow
                  label="Inicio de conversación"
                  value={formatDateTime(conversation.started_at)}
                />
              )}
              {conversation.updated_at && (
                <InfoRow
                  label="Última actividad"
                  value={formatDateTime(conversation.updated_at)}
                />
              )}
            </div>

            {/* Payments */}
            <>
              <div className="h-px bg-border" />
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Pagos{payments.length > 0 ? ` (${payments.length})` : ""}
                  </p>
                  {!showAddPayment && (
                    <button
                      className="text-xs text-primary hover:opacity-70"
                      onClick={() => {
                        setNewAmount("");
                        setNewCurrency("COP");
                        setNewState("validated");
                        setShowAddPayment(true);
                      }}
                    >
                      + Agregar pago
                    </button>
                  )}
                </div>

                {payments.length === 0 && !showAddPayment && (
                  <p className="text-xs text-muted-foreground">
                    No hay pagos registrados.
                  </p>
                )}

                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl border bg-muted/20 p-3 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        {editingAmountId === p.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={1}
                              className="h-7 w-28 rounded-md border bg-background px-2 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50"
                              value={amountDraft}
                              disabled={updatePaymentAmount.isPending}
                              onChange={(e) => setAmountDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const v = parseFloat(amountDraft);
                                  if (!isNaN(v) && v > 0) {
                                    updatePaymentAmount.mutate(
                                      { id: p.id, amount: v },
                                      {
                                        onSuccess: () => {
                                          setEditingAmountId(null);
                                          toast.success("Monto actualizado");
                                        },
                                      }
                                    );
                                  } else {
                                    toast.error(
                                      "El monto debe ser un número positivo"
                                    );
                                  }
                                }
                                if (
                                  e.key === "Escape" &&
                                  !updatePaymentAmount.isPending
                                )
                                  setEditingAmountId(null);
                              }}
                              autoFocus
                            />
                            <button
                              className="text-primary hover:opacity-70 disabled:opacity-40"
                              disabled={updatePaymentAmount.isPending}
                              onClick={() => {
                                const v = parseFloat(amountDraft);
                                if (!isNaN(v) && v > 0) {
                                  updatePaymentAmount.mutate(
                                    { id: p.id, amount: v },
                                    {
                                      onSuccess: () => {
                                        setEditingAmountId(null);
                                        toast.success("Monto actualizado");
                                      },
                                    }
                                  );
                                } else {
                                  toast.error(
                                    "El monto debe ser un número positivo"
                                  );
                                }
                              }}
                            >
                              <Check size={14} />
                            </button>
                            <button
                              className="text-muted-foreground hover:opacity-70 disabled:opacity-40"
                              disabled={updatePaymentAmount.isPending}
                              onClick={() => setEditingAmountId(null)}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-sm">
                              {p.amount != null
                                ? new Intl.NumberFormat("es-CO", {
                                    style: "currency",
                                    currency: p.currency ?? "COP",
                                    maximumFractionDigits: 0,
                                  }).format(p.amount)
                                : "Sin monto"}
                            </span>
                            <button
                              className="text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setAmountDraft(String(p.amount ?? ""));
                                setEditingAmountId(p.id);
                              }}
                            >
                              <Pencil size={11} />
                            </button>
                          </div>
                        )}
                        {p.receipt_date && (
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(p.receipt_date)}
                          </span>
                        )}
                      </div>
                      <PaymentStateLabel state={p.state ?? ""} />
                    </div>
                    {(p as unknown as { receipt_url?: string | null })
                      .receipt_url && (
                      <a
                        href={
                          (p as unknown as { receipt_url?: string }).receipt_url
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary underline underline-offset-2 truncate"
                      >
                        Ver comprobante
                      </a>
                    )}
                    <Select
                      value={p.state ?? undefined}
                      onValueChange={(v) =>
                        updatePaymentState.mutate({ id: p.id, state: v })
                      }
                      disabled={updatePaymentState.isPending}
                    >
                      <SelectTrigger className="h-8 text-xs bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_STATE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}

                {showAddPayment && (
                  <div className="rounded-xl border bg-muted/20 p-3 flex flex-col gap-3">
                    <p className="text-xs font-medium">Nuevo pago</p>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={1}
                        placeholder="Monto"
                        className="h-8 flex-1 rounded-md border bg-background px-2 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50"
                        value={newAmount}
                        disabled={createPayment.isPending}
                        onChange={(e) => setNewAmount(e.target.value)}
                      />
                      <Select
                        value={newCurrency}
                        onValueChange={setNewCurrency}
                        disabled={createPayment.isPending}
                      >
                        <SelectTrigger className="h-8 w-24 text-xs bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="COP">COP</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Select
                      value={newState}
                      onValueChange={setNewState}
                      disabled={createPayment.isPending}
                    >
                      <SelectTrigger className="h-8 text-xs bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="validated">Validado</SelectItem>
                        <SelectItem value="pending_manual_review">
                          Revisión manual
                        </SelectItem>
                        <SelectItem value="rejected">Rechazado</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-7 text-xs flex-1"
                        disabled={createPayment.isPending}
                        onClick={() => {
                          const v = parseFloat(newAmount);
                          if (isNaN(v) || v <= 0) {
                            toast.error("El monto debe ser un número positivo");
                            return;
                          }
                          createPayment.mutate(
                            {
                              phone: conversation!.phone,
                              conversation_id: conversation!.id,
                              flow_id: conversation!.flow_id ?? null,
                              whatsapp_instance_id: null,
                              amount: v,
                              currency: newCurrency,
                              state: newState,
                            },
                            {
                              onSuccess: () => {
                                setShowAddPayment(false);
                                toast.success("Pago registrado");
                              },
                            }
                          );
                        }}
                      >
                        Guardar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs flex-1"
                        disabled={createPayment.isPending}
                        onClick={() => setShowAddPayment(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>

            {/* Ad source */}
            {ad && (
              <>
                <div className="h-px bg-border" />
                <div className="flex flex-col gap-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-violet-600">
                    <Megaphone size={12} />
                    Origen del anuncio Meta
                  </p>
                  <InfoRow label="Anuncio" value={ad.ad_name} />
                  <InfoRow label="Conjunto de anuncios" value={ad.adset_name} />
                  <InfoRow label="Campaña" value={ad.campaign_name} />
                  {ad.headline && (
                    <InfoRow label="Titular" value={`"${ad.headline}"`} />
                  )}
                  {ad.created_at && (
                    <InfoRow
                      label="Clic registrado"
                      value={formatDateTime(ad.created_at)}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── ConversationDetailPage ─────────────────────────────────────────────────

export function ConversationDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const chatWindowRef = useRef<HTMLDivElement | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [flowTriggerOpen, setFlowTriggerOpen] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState("");
  const [selectedStepId, setSelectedStepId] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const { data: conversation, isLoading: convLoading } =
    useConversationQuery(id);
  const { data: flows } = useFlowsV2Query();
  const { data: selectedFlowDetail } = useFlowV2Query(selectedFlowId);
  const sendMutation = useSendConversationMessageMutation(id);
  const sendMediaMutation = useSendMediaFromLibraryMutation(id);
  const stageMutation = useUpdateConversationStageMutation(id);
  const triggerFlowMutation = useTriggerFlowMutation(id);
  const stopFlowMutation = useStopFlowMutation(id);

  // Initial load
  useEffect(() => {
    if (!id) return;
    setInitialLoading(true);
    setMessages([]);
    setPage(1);
    api
      .getConversationMessages(id, 1, PAGE_SIZE, true)
      .then((res) => {
        setMessages([...res.items].reverse());
        setTotal(res.total);
      })
      .finally(() => setInitialLoading(false));
  }, [id]);

  // Scroll to bottom on initial load — dep on initialLoading only is intentional:
  // we want this to fire once when loading finishes, not on every new message.
  useEffect(() => {
    if (!initialLoading && messages.length > 0) {
      const el = chatWindowRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoading]);

  // Auto-scroll when new messages arrive
  const prevLengthRef = useRef(0);
  useEffect(() => {
    if (messages.length > prevLengthRef.current) {
      const el = chatWindowRef.current;
      if (el) {
        const isNearBottom =
          el.scrollHeight - el.scrollTop - el.clientHeight < 200;
        if (isNearBottom) el.scrollTop = el.scrollHeight;
      }
    }
    prevLengthRef.current = messages.length;
  }, [messages.length]);

  const hasMore = messages.length < total;

  const loadOlderMessages = useCallback(async () => {
    if (loadingOlder || !hasMore || !id) return;
    setLoadingOlder(true);
    const nextPage = page + 1;
    try {
      const res = await api.getConversationMessages(
        id,
        nextPage,
        PAGE_SIZE,
        true
      );
      const older = [...res.items].reverse();
      const el = chatWindowRef.current;
      const prevScrollHeight = el?.scrollHeight ?? 0;
      setMessages((prev) => [...older, ...prev]);
      setPage(nextPage);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevScrollHeight;
      });
    } finally {
      setLoadingOlder(false);
    }
  }, [id, page, loadingOlder, hasMore]);

  const onScroll = useCallback(() => {
    const el = chatWindowRef.current;
    if (!el) return;
    if (el.scrollTop < 80) void loadOlderMessages();
  }, [loadOlderMessages]);

  const groupedMessages = useMemo(() => {
    const groups: Array<{ day: string; items: typeof messages }> = [];
    for (const msg of messages) {
      const day = msg.created_at ? formatDay(msg.created_at) : "Sin fecha";
      const last = groups[groups.length - 1];
      if (!last || last.day !== day) {
        groups.push({ day, items: [msg] });
      } else {
        last.items.push(msg);
      }
    }
    return groups;
  }, [messages]);

  const isSending = sendMutation.isPending || sendMediaMutation.isPending;

  const onSend = async () => {
    if (isSending || !text.trim()) return;
    await sendMutation.mutateAsync({ type: "text", text });
    setText("");
    const res = await api.getConversationMessages(id, 1, PAGE_SIZE, true);
    setMessages([...res.items].reverse());
    setTotal(res.total);
    requestAnimationFrame(() => {
      const el = chatWindowRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const onMediaSelected = async (results: MediaPickerResult[]) => {
    try {
      for (const result of results) {
        await sendMediaMutation.mutateAsync({
          url: result.url,
          filename: result.filename,
          mimeType: result.mimeType,
        });
      }
      const res = await api.getConversationMessages(id, 1, PAGE_SIZE, true);
      setMessages([...res.items].reverse());
      setTotal(res.total);
      requestAnimationFrame(() => {
        const el = chatWindowRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    } catch {
      toast.error("Error al enviar uno o más archivos");
    } finally {
      setMediaPickerOpen(false);
    }
  };

  const refreshMessages = async () => {
    setRefreshing(true);
    try {
      const res = await api.getConversationMessages(id, 1, PAGE_SIZE, true);
      setMessages([...res.items].reverse());
      setTotal(res.total);
      setPage(1);
      requestAnimationFrame(() => {
        const el = chatWindowRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    } catch {
      toast.error("No se pudo actualizar los mensajes");
    } finally {
      setRefreshing(false);
    }
  };

  const adSource = conversation?.ad_source;

  return (
    <>
      {/* The section fills the flex container created by AppLayout's outlet wrapper */}
      <section className="flex h-full flex-col overflow-hidden">
        {/* ── Header ── */}
        <div className="flex shrink-0 items-center gap-2 border-b bg-background px-4 py-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate(-1)}
            className="shrink-0"
            aria-label="Volver"
          >
            <ArrowLeft size={18} />
          </Button>

          <div className="flex flex-1 items-center gap-2 min-w-0 overflow-hidden">
            {convLoading ? (
              <>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-16" />
              </>
            ) : (
              <>
                <span className="font-semibold text-sm leading-none truncate">
                  {conversation ? formatPhone(conversation.phone) : id}
                </span>
                {conversation && (
                  <StatusBadge state={String(conversation.stage)} />
                )}
                {conversation?.flow_name && (
                  <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground min-w-0">
                    <Workflow size={11} className="shrink-0" />
                    <span className="truncate max-w-35">
                      {conversation.flow_name}
                    </span>
                  </span>
                )}
                {adSource && (
                  <span className="hidden sm:flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-600 shrink-0">
                    <Megaphone size={10} />
                    Anuncio
                  </span>
                )}
              </>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setSelectedFlowId("");
              setFlowTriggerOpen(true);
            }}
            className="shrink-0 text-muted-foreground"
            aria-label="Activar flujo manualmente"
            title="Activar flujo manualmente"
          >
            <PlayCircle size={17} />
          </Button>
          {conversation?.stage === "en_flujo" && (
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={stopFlowMutation.isPending}
              onClick={() => {
                stopFlowMutation.mutate(undefined, {
                  onSuccess: () => toast.success("Flujo detenido"),
                  onError: () => toast.error("No se pudo detener el flujo"),
                });
              }}
              className="shrink-0 text-muted-foreground hover:text-destructive"
              aria-label="Detener flujo"
              title="Detener flujo activo"
            >
              <StopCircle size={17} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void refreshMessages()}
            disabled={refreshing}
            className="shrink-0 text-muted-foreground"
            aria-label="Actualizar mensajes"
            title="Actualizar mensajes"
          >
            <RefreshCw size={17} className={refreshing ? "animate-spin" : ""} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setInfoOpen(true)}
            className="shrink-0 text-muted-foreground"
            aria-label="Ver detalles"
          >
            <Info size={17} />
          </Button>
        </div>

        {/* ── Chat window ── */}
        <div
          ref={chatWindowRef}
          className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-3"
          onScroll={onScroll}
        >
          {loadingOlder && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              Cargando mensajes anteriores…
            </p>
          )}
          {!loadingOlder && hasMore && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              Sube para cargar mensajes anteriores
            </p>
          )}
          {!loadingOlder && !hasMore && messages.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <Info size={13} className="shrink-0 text-muted-foreground/70" />
              <span>
                El historial se conserva por <strong>90 días</strong>. Los
                mensajes anteriores a esa fecha son eliminados automáticamente.
              </span>
            </div>
          )}

          {initialLoading ? (
            <div className="flex flex-col gap-3 pt-2">
              {[80, 140, 60, 200, 90].map((w, i) => (
                <div
                  key={i}
                  className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}
                >
                  <Skeleton className="h-10 rounded-2xl" style={{ width: w }} />
                </div>
              ))}
            </div>
          ) : groupedMessages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              No hay mensajes en esta conversación.
            </div>
          ) : (
            groupedMessages.map((group) => (
              <div key={group.day} className="flex flex-col gap-1.5">
                <DaySeparator day={group.day} />
                {group.items.map((m) => (
                  <ChatBubble key={m.id} m={m} />
                ))}
              </div>
            ))
          )}
        </div>

        {/* ── Composer ── */}
        <div className="shrink-0 border-t bg-background px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Adjuntar desde biblioteca"
              onClick={() => setMediaPickerOpen(true)}
              disabled={isSending}
              className="mb-1 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <Library size={18} />
            </button>
            <textarea
              rows={1}
              aria-label="Mensaje"
              placeholder="Escribe un mensaje…"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                e.currentTarget.style.height = "auto";
                e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 120)}px`;
              }}
              disabled={isSending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void onSend();
                }
              }}
              className="max-h-30 min-h-9.5 flex-1 resize-none overflow-y-auto rounded-xl border bg-muted px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            />
            <Button
              size="icon"
              onClick={() => void onSend()}
              disabled={isSending || !text.trim()}
              className="mb-0.5 shrink-0 rounded-xl"
              aria-label="Enviar"
            >
              <Send size={16} />
            </Button>
          </div>
        </div>
      </section>

      <MediaPickerModal
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={(result) => void onMediaSelected(result)}
        title="Enviar desde biblioteca"
      />

      <Dialog open={flowTriggerOpen} onOpenChange={setFlowTriggerOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlayCircle size={18} />
              Activar flujo manualmente
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-1">
            <p className="text-sm text-muted-foreground">
              Selecciona el flujo que deseas enviar a este usuario. Esto
              cancelará cualquier flujo activo y comenzará desde el paso 1.
            </p>
            <Select
              value={selectedFlowId}
              onValueChange={(v) => {
                setSelectedFlowId(v);
                setSelectedStepId("");
              }}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Seleccionar flujo…" />
              </SelectTrigger>
              <SelectContent>
                {(flows ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedFlowId && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Desde el paso
                </label>
                <Select
                  value={selectedStepId}
                  onValueChange={setSelectedStepId}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Paso 1 (inicio)" />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedFlowDetail?.steps ?? [])
                      .slice()
                      .sort((a, b) => a.position - b.position)
                      .map((s, i) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.label
                            ? `Paso ${i + 1} — ${s.label}`
                            : `Paso ${i + 1}`}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button
              disabled={!selectedFlowId || triggerFlowMutation.isPending}
              onClick={() => {
                triggerFlowMutation.mutate(
                  {
                    flowId: selectedFlowId,
                    stepId: selectedStepId || undefined,
                  },
                  {
                    onSuccess: () => {
                      toast.success("Flujo activado correctamente");
                      setFlowTriggerOpen(false);
                    },
                    onError: () => toast.error("No se pudo activar el flujo"),
                  }
                );
              }}
            >
              {triggerFlowMutation.isPending ? "Activando…" : "Activar flujo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ClientInfoModal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        conversation={conversation}
        onStageChange={(stage) => {
          stageMutation.mutate(stage, {
            onSuccess: () => toast.success("Estado actualizado"),
            onError: () => toast.error("No se pudo actualizar el estado"),
          });
        }}
        stageChangePending={stageMutation.isPending}
      />
    </>
  );
}
