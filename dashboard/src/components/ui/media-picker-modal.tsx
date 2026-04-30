import { useRef, useState } from "react";
import {
  Image as ImageIcon,
  FileText,
  Video,
  Music,
  Upload,
  Search,
  X,
  Check,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OrgMedia, MediaTypeFilter } from "@/types/api";
import { useOrgMediaQuery, useUploadOrgMediaMutation } from "@/lib/hooks";
import { toast } from "sonner";

// ── Helpers ───────────────────────────────────────────────────────────────

function formatBytes(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TYPE_LABELS: Record<MediaTypeFilter, string> = {
  all: "Todo",
  image: "Imágenes",
  video: "Videos",
  document: "Documentos",
  audio: "Audios",
};

function MediaIcon({
  type,
  className,
}: {
  type: OrgMedia["media_type"];
  className?: string;
}) {
  if (type === "image") return <ImageIcon size={20} className={className} />;
  if (type === "video") return <Video size={20} className={className} />;
  if (type === "audio") return <Music size={20} className={className} />;
  return <FileText size={20} className={className} />;
}

// ── MediaCard ─────────────────────────────────────────────────────────────

function MediaCard({
  item,
  selected,
  onSelect,
}: {
  item: OrgMedia;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex flex-col overflow-hidden rounded-lg border-2 transition-all ${
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-transparent bg-muted/40 hover:border-muted-foreground/30 hover:bg-muted/60"
      }`}
    >
      {/* Preview */}
      <div className="relative aspect-square w-full bg-muted/60 flex items-center justify-center overflow-hidden">
        {item.media_type === "image" ? (
          <img
            src={item.public_url}
            alt={item.original_name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 p-2">
            <MediaIcon
              type={item.media_type}
              className={
                item.media_type === "video"
                  ? "text-violet-500"
                  : item.media_type === "audio"
                    ? "text-orange-500"
                    : "text-blue-500"
              }
            />
          </div>
        )}
        {selected && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check size={14} />
            </div>
          </div>
        )}
      </div>
      {/* Name */}
      <div className="px-2 py-1.5">
        <p className="truncate text-[11px] font-medium leading-tight text-foreground">
          {item.original_name}
        </p>
        {item.size_bytes && (
          <p className="text-[10px] text-muted-foreground">
            {formatBytes(item.size_bytes)}
          </p>
        )}
      </div>
    </button>
  );
}

// ── MediaPickerModal ──────────────────────────────────────────────────────

export type MediaPickerResult = {
  url: string;
  filename: string;
  mediaType: OrgMedia["media_type"];
  mimeType: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (results: MediaPickerResult[]) => void;
  /** If set, only shows media of this type */
  allowedType?: "image" | "video" | "document" | "audio";
  title?: string;
};

export function MediaPickerModal({
  open,
  onClose,
  onSelect,
  allowedType,
  title = "Seleccionar media",
}: Props) {
  const [typeFilter, setTypeFilter] = useState<MediaTypeFilter>(
    allowedType ?? "all"
  );
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const mediaQuery = useOrgMediaQuery({
    mediaType: typeFilter !== "all" ? typeFilter : undefined,
    pageSize: 100,
  });
  const upload = useUploadOrgMediaMutation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const items = (mediaQuery.data?.items ?? []).filter((item) => {
    if (!search.trim()) return true;
    return item.original_name.toLowerCase().includes(search.toLowerCase());
  });

  const selectedItems = (mediaQuery.data?.items ?? []).filter((i) => selectedIds.has(i.id));

  const handleUpload = async (file: File) => {
    try {
      const result = await upload.mutateAsync(file);
      setSelectedIds((prev) => new Set([...prev, result.media.id]));
      toast.success("Archivo subido");
    } catch {
      toast.error("No se pudo subir el archivo");
    }
  };

  const handleConfirm = () => {
    if (selectedItems.length === 0) return;
    onSelect(
      selectedItems.map((item) => ({
        url: item.public_url,
        filename: item.original_name,
        mediaType: item.media_type,
        mimeType: item.mime_type,
      }))
    );
    setSelectedIds(new Set());
    onClose();
  };

  const handleClose = () => {
    setSelectedIds(new Set());
    onClose();
  };

  const acceptAttr =
    allowedType === "image"
      ? "image/*"
      : allowedType === "video"
        ? "video/*"
        : allowedType === "audio"
          ? "audio/*"
          : allowedType === "document"
            ? ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
            : "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        showCloseButton
        className="flex h-[80vh] max-h-[680px] flex-col gap-0 p-0 sm:max-w-3xl"
      >
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          {/* Type filter tabs — hidden if allowedType is forced */}
          {!allowedType && (
            <div className="flex gap-1">
              {(
                [
                  "all",
                  "image",
                  "video",
                  "audio",
                  "document",
                ] as MediaTypeFilter[]
              ).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setTypeFilter(t); setSelectedIds(new Set()); }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    typeFilter === t
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative flex-1 min-w-[160px]">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Buscar por nombre…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-7 text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Upload */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={acceptAttr}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              e.currentTarget.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            disabled={upload.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {upload.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Upload size={13} />
            )}
            {upload.isPending ? "Subiendo…" : "Subir archivo"}
          </Button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {mediaQuery.isLoading ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square animate-pulse rounded-lg bg-muted"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
              <ImageIcon size={32} className="text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {search
                  ? "No hay resultados"
                  : "No hay archivos subidos todavía"}
              </p>
              {!search && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1 gap-1.5 text-xs"
                  disabled={upload.isPending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={13} />
                  Subir el primero
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {items.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  selected={selectedIds.has(item.id)}
                  onSelect={() =>
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                      return next;
                    })
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {selectedItems.length > 0
              ? `${selectedItems.length} seleccionado${selectedItems.length !== 1 ? "s" : ""}`
              : `${items.length} archivo${items.length !== 1 ? "s" : ""}`}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleClose}>
              Cancelar
            </Button>
            <Button size="sm" disabled={selectedItems.length === 0} onClick={handleConfirm}>
              {selectedItems.length > 1 ? `Enviar ${selectedItems.length} archivos` : "Usar este archivo"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
