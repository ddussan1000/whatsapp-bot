import { Paperclip, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEventHandler } from "react";
import { useParams } from "react-router-dom";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import {
  useConversationMessagesQuery,
  useConversationQuery,
  useSendConversationMessageMutation,
  useUploadAndSendFileMutation,
} from "../lib/hooks";

export function ConversationDetailPage() {
  const { id = "" } = useParams();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatWindowRef = useRef<HTMLDivElement | null>(null);
  const [page] = useState(1);
  const [pageSize] = useState(100);

  const { data: conversation } = useConversationQuery(id);
  const { data, isLoading } = useConversationMessagesQuery(id, page, pageSize);
  const sendMutation = useSendConversationMessageMutation(id);
  const uploadMutation = useUploadAndSendFileMutation(id);
  const messages = useMemo(() => data?.items ?? [], [data]);
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

  useEffect(() => {
    const el = chatWindowRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [groupedMessages.length, messages.length]);

  const ENFORCE_24H_WINDOW = false;
  const startedAtMs = conversation?.started_at
    ? new Date(conversation.started_at).getTime()
    : null;
  const within24h = startedAtMs
    ? Date.now() - startedAtMs < 24 * 60 * 60 * 1000
    : true;
  const canSend = ENFORCE_24H_WINDOW ? within24h : true;

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
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropFile}
        >
          {isLoading ? <p className="muted">Cargando mensajes...</p> : null}
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
            Ventana 24h preparada:{" "}
            {ENFORCE_24H_WINDOW
              ? within24h
                ? "activa"
                : "bloqueada"
              : "desactivada (siempre activo)"}
            .
          </p>
        </div>
      </Card>
    </section>
  );
}
