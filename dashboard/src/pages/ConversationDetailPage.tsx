import { Paperclip, Send, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEventHandler } from "react";
import { useParams } from "react-router-dom";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import {
  useConversationQuery,
  useSendConversationMessageMutation,
  useUploadAndSendFileMutation,
} from "../lib/hooks";
import { api } from "../lib/api";
import type { ChatMessage } from "../types/api";

const PAGE_SIZE = 50;

export function ConversationDetailPage() {
  const { id = "" } = useParams();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatWindowRef = useRef<HTMLDivElement | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const { data: conversation } = useConversationQuery(id);
  const sendMutation = useSendConversationMessageMutation(id);
  const uploadMutation = useUploadAndSendFileMutation(id);

  // Initial load: fetch most recent PAGE_SIZE messages (desc → reverse for display)
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

  // Scroll to bottom when new outbound messages arrive (after send)
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
      // Restore scroll position so prepended messages don't jump the view
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
      const day = msg.created_at
        ? new Date(msg.created_at).toLocaleDateString("es-CO", {
            weekday: "long",
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "Sin fecha";
      const last = groups[groups.length - 1];
      if (!last || last.day !== day) {
        groups.push({ day, items: [msg] });
      } else {
        last.items.push(msg);
      }
    }
    return groups;
  }, [messages]);

  const canSend = true;
  const isSending = sendMutation.isPending || uploadMutation.isPending;

  const onSend = async () => {
    if (!canSend || isSending) return;
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
    // Refresh to show sent message
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

  const getMessageMainText = (m: (typeof messages)[number]) => {
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
      const image = payload.image as
        | { caption?: string; id?: string }
        | undefined;
      return image?.caption?.trim() || "Imagen";
    }

    if (m.message_type === "document") {
      const doc = payload.document as
        | { filename?: string; caption?: string }
        | undefined;
      return doc?.caption?.trim() || doc?.filename?.trim() || "Documento";
    }

    return "Mensaje";
  };

  const getAttachmentLabel = (m: (typeof messages)[number]) => {
    const payload =
      (m.payload as Record<string, unknown> | null | undefined) ?? {};
    if (m.message_type === "image") {
      const image = payload.image as { id?: string; link?: string } | undefined;
      if (m.media_url) return "Ver imagen";
      if (image?.link) return "Abrir imagen";
      if (image?.id) return `Imagen adjunta (${image.id.slice(0, 8)}...)`;
    }
    if (m.message_type === "document") {
      const doc = payload.document as
        | { id?: string; link?: string; filename?: string }
        | undefined;
      if (m.media_url)
        return doc?.filename
          ? `Descargar ${doc.filename}`
          : "Descargar documento";
      if (doc?.link)
        return doc.filename ? `Descargar ${doc.filename}` : "Abrir documento";
      if (doc?.id) return `Documento adjunto (${doc.id.slice(0, 8)}...)`;
    }
    return null;
  };

  return (
    <section>
      <div className="page-header">
        <h2>Conversación {conversation?.phone ?? ""}</h2>
      </div>
      <Card className="chat-card">
        <div
          ref={chatWindowRef}
          className="chat-window"
          onScroll={onScroll}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropFile}
        >
          {loadingOlder && (
            <p
              className="muted"
              style={{ textAlign: "center", padding: "8px 0" }}
            >
              Cargando mensajes anteriores...
            </p>
          )}
          {!loadingOlder && hasMore && (
            <p
              className="muted"
              style={{
                textAlign: "center",
                padding: "8px 0",
                fontSize: "0.75rem",
              }}
            >
              Sube para cargar mensajes anteriores
            </p>
          )}
          {initialLoading ? (
            <p className="muted">Cargando mensajes...</p>
          ) : null}
          {groupedMessages.map((group) => (
            <div key={group.day} className="day-group">
              <div className="day-separator">{group.day}</div>
              {group.items.map((m) => (
                <div
                  key={m.id}
                  className={
                    m.direction === "outbound"
                      ? "bubble bubble-out"
                      : "bubble bubble-in"
                  }
                >
                  <p>{getMessageMainText(m)}</p>
                  {m.media_url ? (
                    <a href={m.media_url} target="_blank" rel="noreferrer">
                      {getAttachmentLabel(m) ?? m.media_url}
                    </a>
                  ) : getAttachmentLabel(m) ? (
                    <p className="muted">{getAttachmentLabel(m)}</p>
                  ) : null}
                  <p className="bubble-time">
                    {m.created_at
                      ? new Date(m.created_at).toLocaleTimeString("es-CO", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="chat-composer whatsapp-composer">
          {file ? (
            <div className="attachment-pill">
              <span>
                Adjunto: {file.name} ({Math.round(file.size / 1024)} KB)
              </span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                aria-label="Quitar adjunto"
              >
                <X size={16} />
              </button>
            </div>
          ) : null}

          <div className="composer-inline">
            <button
              type="button"
              className="icon-btn"
              aria-label="Adjuntar archivo"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canSend || isSending}
            >
              <Paperclip size={18} />
            </button>
            <input
              ref={fileInputRef}
              className="hidden-file"
              type="file"
              accept="image/*,.pdf,.doc,.docx,.txt,.xls,.xlsx,.csv,.ppt,.pptx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <input
              className="composer-input"
              placeholder={
                file ? "Agrega un caption (opcional)..." : "Escribe un mensaje"
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={!canSend}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void onSend();
                }
              }}
            />
            <Button
              className="send-btn"
              onClick={onSend}
              disabled={!canSend || isSending}
            >
              <Send size={16} />
            </Button>
          </div>
          <p className="muted">
            Ventana 24h preparada: desactivada (siempre activo).
          </p>
        </div>
      </Card>
    </section>
  );
}
