import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  Check,
  Copy,
  Hash,
  Pencil,
  RefreshCw,
  Shield,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCreateInviteMutation,
  useCurrentOrgQuery,
  useInvitesQuery,
  useResendInviteMutation,
  useUpdateOrgMutation,
} from "@/lib/hooks";
import type { OrgRole } from "@/types/api";

// ── Helpers ───────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Propietario",
  admin: "Administrador",
  agent: "Agente",
  viewer: "Solo lectura",
};

const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  owner: "Control total, incluyendo facturación",
  admin: "Gestiona flujos, instancias y usuarios",
  agent: "Puede ver conversaciones y pagos",
  viewer: "Solo lectura, sin modificaciones",
};

function inviteStatusConfig(status: string): {
  label: string;
  className: string;
} {
  switch (status) {
    case "accepted":
      return {
        label: "Aceptada",
        className: "bg-green-500/10 text-green-600 border-green-500/20",
      };
    case "pending":
      return {
        label: "Pendiente",
        className: "bg-amber-500/10 text-amber-600 border-amber-500/20",
      };
    case "revoked":
      return {
        label: "Revocada",
        className: "bg-red-500/10 text-red-600 border-red-500/20",
      };
    case "expired":
      return {
        label: "Expirada",
        className: "bg-red-500/10 text-red-600 border-red-500/20",
      };
    default:
      return {
        label: status,
        className: "bg-muted text-muted-foreground border-border",
      };
  }
}

// ── Sections ──────────────────────────────────────────────────────────────

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-start gap-3 border-b px-5 py-4">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon size={15} />
        </div>
        <div>
          <p className="font-semibold">{title}</p>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

// ── OrganizationPage ──────────────────────────────────────────────────────

export function OrganizationPage() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("agent");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const org = useCurrentOrgQuery();
  const invites = useInvitesQuery();
  const createInvite = useCreateInviteMutation();
  const resendInvite = useResendInviteMutation();
  const updateOrg = useUpdateOrgMutation();

  // Sync name input when data loads — setState in effect is intentional here:
  // initializes local edit state from async server data when not actively editing.
  useEffect(() => {
    if (org.data?.organization.name && !editingName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNameInput(org.data.organization.name);
    }
  }, [org.data?.organization.name, editingName]);

  const canEditOrg = ["owner", "admin"].includes(
    org.data?.membership.role ?? ""
  );

  const handleSaveName = () => {
    if (!nameInput.trim() || nameInput === org.data?.organization.name) {
      setEditingName(false);
      return;
    }
    updateOrg.mutate(
      { name: nameInput.trim() },
      {
        onSuccess: () => {
          toast.success("Nombre actualizado");
          setEditingName(false);
        },
        onError: () => toast.error("No se pudo actualizar el nombre"),
      }
    );
  };

  return (
    <section className="flex flex-col gap-4 p-3 sm:gap-6 sm:p-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold">Organización</h2>
        <p className="text-sm text-muted-foreground">
          Datos de tu organización, roles y accesos del equipo.
        </p>
      </div>

      {/* Org info */}
      <SectionCard
        icon={Building2}
        title="Datos de la organización"
        description="Nombre visible en reportes, conversaciones y notificaciones."
      >
        {org.isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
        ) : org.error ? (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              No se pudo cargar la organización.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Name */}
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Nombre
              </p>
              {editingName ? (
                <div className="flex items-center gap-2 max-w-sm">
                  <Input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName();
                      if (e.key === "Escape") setEditingName(false);
                    }}
                    autoFocus
                    className="h-9 text-sm"
                  />
                  <Button
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={handleSaveName}
                    disabled={updateOrg.isPending}
                  >
                    <Check size={15} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 shrink-0"
                    onClick={() => {
                      setNameInput(org.data?.organization.name ?? "");
                      setEditingName(false);
                    }}
                  >
                    <X size={15} />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-base font-medium">
                    {org.data?.organization.name}
                  </span>
                  {canEditOrg && (
                    <button
                      type="button"
                      onClick={() => setEditingName(true)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Editar nombre"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Slug + role */}
            <div className="flex flex-wrap items-start gap-6">
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Hash size={10} />
                  Identificador (slug)
                </p>
                <div className="flex items-center gap-2">
                  <code className="rounded border bg-muted px-2 py-0.5 text-xs font-mono">
                    {org.data?.organization.slug}
                  </code>
                  <button
                    type="button"
                    aria-label="Copiar slug"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => {
                      const slug = org.data?.organization.slug;
                      if (slug) {
                        void navigator.clipboard.writeText(slug);
                        toast.success("Slug copiado");
                      }
                    }}
                  >
                    <Copy size={13} />
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground max-w-xs">
                  Identificador interno de solo lectura. Se usa en integraciones
                  y webhooks.
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Shield size={10} />
                  Tu rol
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                      org.data?.membership.role === "owner"
                        ? "border-violet-500/20 bg-violet-500/10 text-violet-600"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {ROLE_LABELS[org.data?.membership.role as OrgRole] ?? "—"}
                  </span>
                </div>
                {org.data?.membership.role && (
                  <p className="text-[11px] text-muted-foreground">
                    {ROLE_DESCRIPTIONS[org.data.membership.role as OrgRole]}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Invite */}
      <SectionCard
        icon={UserPlus}
        title="Invitar al equipo"
        description="Envía una invitación por correo electrónico con el rol asignado."
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5 min-w-50 flex-1 max-w-xs">
              <label
                htmlFor="invite-email"
                className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                Correo
              </label>
              <Input
                id="invite-email"
                type="email"
                placeholder="correo@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && email.trim()) {
                    createInvite.mutate({ email: email.trim(), role });
                    setEmail("");
                  }
                }}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Rol
              </span>
              <Select value={role} onValueChange={(v) => setRole(v as OrgRole)}>
                <SelectTrigger className="h-9 w-44 text-sm">
                  <SelectValue placeholder="Rol" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as OrgRole[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      <div className="flex flex-col">
                        <span>{ROLE_LABELS[r]}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={createInvite.isPending || !email.trim()}
              onClick={() => {
                if (!email.trim()) return;
                createInvite.mutate({ email: email.trim(), role });
                setEmail("");
              }}
              className="h-9"
            >
              {createInvite.isPending ? "Enviando…" : "Invitar"}
            </Button>
          </div>

          {/* Invites table */}
          <div>
            <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Invitaciones enviadas
            </p>
            {invites.isLoading ? (
              <div className="flex flex-col gap-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (invites.data ?? []).length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  No hay invitaciones enviadas aún.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Correo</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Expira</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(invites.data ?? []).map((invite) => {
                    const cfg = inviteStatusConfig(invite.status);
                    const canResend =
                      invite.status === "pending" ||
                      invite.status === "expired";
                    return (
                      <TableRow key={invite.id}>
                        <TableCell className="font-medium">
                          {invite.email}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {ROLE_LABELS[invite.role] ?? invite.role}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cfg.className}`}
                          >
                            {cfg.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(invite.expires_at).toLocaleDateString(
                            "es-CO",
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            }
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {canResend && (
                            <button
                              type="button"
                              title="Reenviar invitación"
                              disabled={resendInvite.isPending}
                              onClick={() =>
                                resendInvite.mutate(invite.id, {
                                  onSuccess: () =>
                                    toast.success(
                                      `Invitación reenviada a ${invite.email}`
                                    ),
                                  onError: () =>
                                    toast.error(
                                      "No se pudo reenviar la invitación"
                                    ),
                                })
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                            >
                              <RefreshCw size={12} />
                              Reenviar
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </SectionCard>
    </section>
  );
}
