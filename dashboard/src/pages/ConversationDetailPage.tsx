import {
  ArrowLeft,
  FileText,
  ImageIcon,
  Info,
  Megaphone,
  Paperclip,
  Send,
  Workflow,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEventHandler } from "react";
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
  useSendConversationMessageMutation,
  useUploadAndSendFileMutation,
  useUpdateConversationStageMutation,
} from "../lib/hooks";
import { api } from "../lib/api";
import type { ChatMessage, Conversation } from "../types/api";

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

// ── Message helpers ────────────────────────────────────────────────────────

function getMessageMainText(m: ChatMessage): string | null {
  if (m.text_body && m.text_body.trim().length > 0) return m.text_body;
  const payload =
    (m.payload as Record<string, unknown> | null | undefined) ?? {};

  if (m.message_type === "interactive") {
    const interactive = payload.interactive as
      | {
          button_reply?: { title?: string };
          list_reply?: { title?: string };
          body?: { text?: string };
        }
      | undefined;
    return (
      interactive?.button_reply?.title ??
      interactive?.list_reply?.title ??
      interactive?.body?.text ??
      "Mensaje interactivo"
    );
  }

  if (m.message_type === "image") {
    const image = payload.image as { caption?: string } | undefined;
    return image?.caption?.trim() || null;
  }

  if (m.message_type === "document") {
    const doc = payload.document as
      | { filename?: string; caption?: string }
      | undefined;
    return doc?.caption?.trim() || doc?.filename?.trim() || null;
  }

  return "Mensaje";
}

function getAttachmentInfo(m: ChatMessage): {
  label: string;
  href?: string;
  isImage: boolean;
} | null {
  const payload =
    (m.payload as Record<string, unknown> | null | undefined) ?? {};

  if (m.message_type === "image") {
    const image = payload.image as { id?: string; link?: string } | undefined;
    const href = m.media_url ?? image?.link;
    return { label: "Imagen adjunta", href, isImage: true };
  }

  if (m.message_type === "document") {
    const doc = payload.document as
      | { id?: string; link?: string; filename?: string }
      | undefined;
    const href = m.media_url ?? doc?.link;
    const label = doc?.filename ?? "Documento adjunto";
    return { label, href, isImage: false };
  }

  return null;
}

// ── ChatBubble ─────────────────────────────────────────────────────────────

function ChatBubble({ m }: { m: ChatMessage }) {
  const isOut = m.direction === "outbound";
  const mainText = getMessageMainText(m);
  const attachment = getAttachmentInfo(m);

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative max-w-[72%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
          isOut
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-card border"
        }`}
      >
        {attachment && (
          <div className="mb-1.5">
            {attachment.isImage ? (
              attachment.href ? (
                <a href={attachment.href} target="_blank" rel="noreferrer">
                  <img
                    src={attachment.href}
                    alt={attachment.label}
                    className="max-h-48 w-auto rounded-lg object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display =
                        "none";
                    }}
                  />
                </a>
              ) : (
                <div
                  className={`flex items-center gap-1.5 text-xs ${
                    isOut
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground"
                  }`}
                >
                  <ImageIcon size={14} />
                  {attachment.label}
                </div>
              )
            ) : (
              <div
                className={`flex items-center gap-1.5 rounded-lg p-2 text-xs ${
                  isOut ? "bg-primary-foreground/10" : "bg-muted"
                }`}
              >
                <FileText
                  size={14}
                  className={
                    isOut
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground"
                  }
                />
                {attachment.href ? (
                  <a
                    href={attachment.href}
                    target="_blank"
                    rel="noreferrer"
                    className={`underline underline-offset-2 ${
                      isOut ? "text-primary-foreground" : "text-foreground"
                    }`}
                  >
                    {attachment.label}
                  </a>
                ) : (
                  <span
                    className={
                      isOut
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    }
                  >
                    {attachment.label}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {mainText && (
          <p className="whitespace-pre-wrap wrap-break-word leading-snug">
            {mainText}
          </p>
        )}

        {m.created_at && (
          <p
            className={`mt-0.5 text-right text-[10px] leading-none ${
              isOut ? "text-primary-foreground/60" : "text-muted-foreground"
            }`}
          >
            {formatTime(m.created_at)}
          </p>
        )}
      </div>
    </div>
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
  { value: "saludo", label: "Saludo" },
  { value: "catalogo", label: "Catálogo" },
  { value: "esperando_comprobante", label: "Esp. comprobante" },
  { value: "confirmar_comprobante", label: "En revisión" },
  { value: "pago_confirmado", label: "Pago confirmado" },
  { value: "comprobante_rechazado", label: "Rechazado" },
  { value: "comprobante_ilegible", label: "Ilegible" },
  { value: "flow_started", label: "En flujo" },
  { value: "ayuda", label: "Ayuda" },
  { value: "interesado", label: "Interesado" },
];

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
      <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
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
                    <SelectItem value="" disabled>
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
  const [file, setFile] = useState<File | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatWindowRef = useRef<HTMLDivElement | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const { data: conversation, isLoading: convLoading } =
    useConversationQuery(id);
  const sendMutation = useSendConversationMessageMutation(id);
  const uploadMutation = useUploadAndSendFileMutation(id);
  const stageMutation = useUpdateConversationStageMutation(id);

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

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!initialLoading && messages.length > 0) {
      const el = chatWindowRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
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

  const isSending = sendMutation.isPending || uploadMutation.isPending;

  const onSend = async () => {
    if (isSending) return;
    if (file) {
      await uploadMutation.mutateAsync({
        kind: file.type.startsWith("image/") ? "image" : "document",
        caption: text || undefined,
        file,
      });
      setText("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (!text.trim()) return;
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

  const onDropFile: DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
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
            onClick={() => navigate("/conversations")}
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
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropFile}
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
        <div
          className="shrink-0 border-t bg-background px-4 py-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropFile}
        >
          {file && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border bg-muted px-3 py-1.5 text-xs">
              <Paperclip size={12} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {file.name}{" "}
                <span className="text-muted-foreground">
                  ({Math.round(file.size / 1024)} KB)
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Quitar adjunto"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Adjuntar archivo"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending}
              className="mb-1 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <Paperclip size={18} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.txt,.xls,.xlsx,.csv,.ppt,.pptx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <textarea
              rows={1}
              placeholder={
                file ? "Agrega un caption (opcional)…" : "Escribe un mensaje…"
              }
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
              disabled={isSending || (!text.trim() && !file)}
              className="mb-0.5 shrink-0 rounded-xl"
              aria-label="Enviar"
            >
              <Send size={16} />
            </Button>
          </div>
        </div>
      </section>

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
