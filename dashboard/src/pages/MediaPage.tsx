import { useRef, useState } from "react";
import {
  Image as ImageIcon,
  FileText,
  Video,
  Upload,
  Trash2,
  Search,
  X,
  Loader2,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { OrgMedia } from "@/types/api";
import {
  useOrgMediaQuery,
  useUploadOrgMediaMutation,
  useDeleteOrgMediaMutation,
} from "@/lib/hooks";
import { toast } from "sonner";

// ── Helpers ───────────────────────────────────────────────────────────────

function formatBytes(bytes?: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type MediaTypeFilter = "all" | "image" | "video" | "document";

const TYPE_LABELS: Record<MediaTypeFilter, string> = {
  all: "Todo",
  image: "Imágenes",
  video: "Videos",
  document: "Documentos",
};

const TYPE_COLORS: Record<OrgMedia["media_type"], string> = {
  image: "bg-emerald-500/10 text-emerald-600",
  video: "bg-violet-500/10 text-violet-600",
  document: "bg-blue-500/10 text-blue-600",
};

const TYPE_ICONS: Record<OrgMedia["media_type"], React.ElementType> = {
  image: ImageIcon,
  video: Video,
  document: FileText,
};

// ── PreviewModal ──────────────────────────────────────────────────────────

function PreviewModal({
  item,
  onClose,
}: {
  item: OrgMedia | null;
  onClose: () => void;
}) {
  if (!item) return null;
  return (
    <Dialog open={Boolean(item)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent showCloseButton className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">
            {item.original_name}
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center rounded-lg bg-muted/40 p-4 min-h-50">
          {item.media_type === "image" && (
            <img
              src={item.public_url}
              alt={item.original_name}
              className="max-h-[60vh] max-w-full rounded object-contain"
            />
          )}
          {item.media_type === "video" && (
            <video
              src={item.public_url}
              controls
              className="max-h-[60vh] max-w-full rounded"
            />
          )}
          {item.media_type === "document" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <FileText size={48} className="text-blue-500" />
              <p className="text-sm text-muted-foreground">
                {item.original_name}
              </p>
              <a
                href={item.public_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary underline underline-offset-2"
              >
                Abrir documento
              </a>
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">Tipo</p>
            <p>{item.mime_type}</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Tamaño</p>
            <p>{formatBytes(item.size_bytes)}</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Subido</p>
            <p>{formatDate(item.created_at)}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── DeleteConfirmDialog ───────────────────────────────────────────────────

function DeleteConfirmDialog({
  item,
  onConfirm,
  onCancel,
  pending,
}: {
  item: OrgMedia | null;
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <Dialog open={Boolean(item)} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent showCloseButton className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminar archivo</DialogTitle>
          <DialogDescription>
            ¿Seguro que querés eliminar{" "}
            <span className="font-medium text-foreground">
              {item?.original_name}
            </span>
            ? Esta acción no se puede deshacer. Los flujos que usen este archivo
            dejarán de funcionar.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
            {pending ? "Eliminando…" : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── MediaCard ─────────────────────────────────────────────────────────────

function MediaCard({
  item,
  onPreview,
  onDelete,
}: {
  item: OrgMedia;
  onPreview: () => void;
  onDelete: () => void;
}) {
  const Icon = TYPE_ICONS[item.media_type];

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md">
      {/* Preview area */}
      <button
        type="button"
        onClick={onPreview}
        className="relative aspect-video w-full overflow-hidden bg-muted/60 focus:outline-none"
      >
        {item.media_type === "image" ? (
          <img
            src={item.public_url}
            alt={item.original_name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Icon
              size={36}
              className={
                item.media_type === "video"
                  ? "text-violet-400"
                  : "text-blue-400"
              }
            />
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
          <span className="scale-90 rounded-md bg-background/90 px-2.5 py-1 text-xs font-medium opacity-0 shadow transition-all group-hover:scale-100 group-hover:opacity-100">
            Ver preview
          </span>
        </div>
      </button>

      {/* Info */}
      <div className="flex items-start gap-2 p-3">
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium leading-tight">
            {item.original_name}
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatBytes(item.size_bytes)}</span>
            <span>·</span>
            <span>{formatDate(item.created_at)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 ${TYPE_COLORS[item.media_type]}`}
          >
            {item.media_type === "image"
              ? "img"
              : item.media_type === "video"
                ? "vid"
                : "doc"}
          </Badge>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
            title="Eliminar"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MediaPage ─────────────────────────────────────────────────────────────

export function MediaPage() {
  const [typeFilter, setTypeFilter] = useState<MediaTypeFilter>("all");
  const [search, setSearch] = useState("");
  const [previewItem, setPreviewItem] = useState<OrgMedia | null>(null);
  const [deleteItem, setDeleteItem] = useState<OrgMedia | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mediaQuery = useOrgMediaQuery({
    mediaType: typeFilter !== "all" ? typeFilter : undefined,
    pageSize: 100,
  });
  const upload = useUploadOrgMediaMutation();
  const remove = useDeleteOrgMediaMutation();

  const allItems = mediaQuery.data?.items ?? [];
  const items = allItems.filter((item) => {
    if (!search.trim()) return true;
    return item.original_name.toLowerCase().includes(search.toLowerCase());
  });

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    let success = 0;
    let fail = 0;
    for (const file of Array.from(files)) {
      try {
        await upload.mutateAsync(file);
        success++;
      } catch {
        fail++;
      }
    }
    if (success > 0)
      toast.success(
        `${success} archivo${success > 1 ? "s" : ""} subido${success > 1 ? "s" : ""}`
      );
    if (fail > 0)
      toast.error(`${fail} archivo${fail > 1 ? "s" : ""} fallaron al subir`);
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      await remove.mutateAsync(deleteItem.id);
      toast.success("Archivo eliminado");
      setDeleteItem(null);
    } catch {
      toast.error("No se pudo eliminar el archivo");
    }
  };

  return (
    <section className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Biblioteca de Media</h2>
          <p className="text-sm text-muted-foreground">
            Administrá los archivos que usás en tus flujos: imágenes, videos y
            documentos.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
            multiple
            onChange={(e) => {
              void handleUpload(e.target.files);
              e.currentTarget.value = "";
            }}
          />
          <Button
            className="gap-2"
            disabled={upload.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {upload.isPending ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Upload size={15} />
            )}
            {upload.isPending ? "Subiendo…" : "Subir archivos"}
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Type filter */}
        <div className="flex gap-1 rounded-lg border bg-muted p-1">
          {(["all", "image", "video", "document"] as MediaTypeFilter[]).map(
            (t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  typeFilter === t
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {TYPE_LABELS[t]}
              </button>
            )
          )}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-50 max-w-xs">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Buscar por nombre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {mediaQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-xl border p-0 overflow-hidden"
            >
              <div className="aspect-video w-full animate-pulse bg-muted" />
              <div className="p-3 flex flex-col gap-1.5">
                <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <FolderOpen size={40} className="text-muted-foreground/40" />
          <div>
            <p className="font-medium text-muted-foreground">
              {search
                ? "No hay archivos que coincidan"
                : typeFilter !== "all"
                  ? `No hay ${TYPE_LABELS[typeFilter].toLowerCase()} subidas`
                  : "La biblioteca está vacía"}
            </p>
            {!search && typeFilter === "all" && (
              <p className="mt-1 text-sm text-muted-foreground">
                Subí imágenes, videos y documentos para usarlos en tus flujos.
              </p>
            )}
          </div>
          {!search && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={upload.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} />
              Subir archivos
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              onPreview={() => setPreviewItem(item)}
              onDelete={() => setDeleteItem(item)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      <DeleteConfirmDialog
        item={deleteItem}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteItem(null)}
        pending={remove.isPending}
      />
    </section>
  );
}
