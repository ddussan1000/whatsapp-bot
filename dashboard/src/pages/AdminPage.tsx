import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AdminOrganization, OrgRole } from "@/types/api";
import { Trash2 } from "lucide-react";

const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Propietario",
  admin: "Administrador",
  agent: "Agente",
  viewer: "Solo lectura",
};

export function AdminPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [editOrg, setEditOrg] = useState<AdminOrganization | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");

  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [allowEmail, setAllowEmail] = useState("");
  const [allowRole, setAllowRole] = useState<OrgRole>("owner");

  const orgs = useQuery({
    queryKey: ["admin", "organizations"],
    queryFn: api.getAdminOrganizations,
  });
  const allowlist = useQuery({
    queryKey: ["admin", "allowlist", selectedOrgId],
    queryFn: () => api.getAdminAllowlist(selectedOrgId),
    enabled: Boolean(selectedOrgId),
  });

  const createOrg = useMutation({
    mutationFn: api.createAdminOrganization,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "organizations"] });
      toast.success("Empresa creada");
      setName("");
      setSlug("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateOrg = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: { name?: string; slug?: string };
    }) => api.updateAdminOrganization(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "organizations"] });
      toast.success("Empresa actualizada");
      setEditOrg(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addAllow = useMutation({
    mutationFn: () =>
      api.addAdminAllowlist(selectedOrgId, {
        email: allowEmail.trim(),
        role: allowRole,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["admin", "allowlist", selectedOrgId],
      });
      toast.success(
        "Correo autorizado. El usuario podrá entrar con Google o enlace mágico."
      );
      setAllowEmail("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delAllow = useMutation({
    mutationFn: api.deleteAdminAllowlist,
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["admin", "allowlist", selectedOrgId],
      });
      toast.success("Entrada eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (o: AdminOrganization) => {
    setEditOrg(o);
    setEditName(o.name);
    setEditSlug(o.slug);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Alert>
        <AlertTitle>Acceso de plataforma</AlertTitle>
        <AlertDescription>
          Aquí das de alta empresas y el correo que podrá iniciar sesión la
          primera vez. Ese correo debe coincidir con Google o con el magic link.
          Tras el primer acceso se crea la membresía y ya no hace falta la fila
          en la lista permitida.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Nueva empresa</CardTitle>
          <CardDescription>
            Nombre visible y slug único (URL). Ej. slug:{" "}
            <code className="text-xs">acme-corp</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid flex-1 gap-2">
            <span className="text-sm font-medium">Nombre</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Acme Colombia"
            />
          </div>
          <div className="grid flex-1 gap-2">
            <span className="text-sm font-medium">Slug</span>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="acme-colombia"
            />
          </div>
          <Button
            disabled={createOrg.isPending || !name.trim() || !slug.trim()}
            onClick={() =>
              createOrg.mutate({ name: name.trim(), slug: slug.trim() })
            }
          >
            Crear
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Empresas</CardTitle>
          <CardDescription>
            Edita datos o gestiona correos permitidos por empresa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orgs.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : orgs.error ? (
            <p className="text-sm text-destructive">
              No se pudieron cargar las empresas.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(orgs.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="h-24 text-center text-muted-foreground"
                    >
                      Aún no hay empresas. Crea una arriba.
                    </TableCell>
                  </TableRow>
                ) : (
                  (orgs.data ?? []).map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {o.slug}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(o)}
                        >
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {editOrg ? (
        <Card>
          <CardHeader>
            <CardTitle>Editar empresa</CardTitle>
            <CardDescription>{editOrg.slug}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid flex-1 gap-2">
              <span className="text-sm font-medium">Nombre</span>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="grid flex-1 gap-2">
              <span className="text-sm font-medium">Slug</span>
              <Input
                value={editSlug}
                onChange={(e) => setEditSlug(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditOrg(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() =>
                  updateOrg.mutate({
                    id: editOrg.id,
                    payload: { name: editName.trim(), slug: editSlug.trim() },
                  })
                }
                disabled={updateOrg.isPending}
              >
                Guardar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Correos permitidos (primer acceso)</CardTitle>
          <CardDescription>
            Elige la empresa, agrega el correo y el rol. Cuando esa persona
            inicie sesión, se creará su usuario y membresía automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:max-w-md">
            <span className="text-sm font-medium">Empresa</span>
            <Select
              value={selectedOrgId || undefined}
              onValueChange={setSelectedOrgId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona empresa" />
              </SelectTrigger>
              <SelectContent>
                {(orgs.data ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name} ({o.slug})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedOrgId ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="grid flex-1 gap-2">
                  <span className="text-sm font-medium">Correo</span>
                  <Input
                    type="email"
                    value={allowEmail}
                    onChange={(e) => setAllowEmail(e.target.value)}
                    placeholder="cliente@empresa.com"
                  />
                </div>
                <div className="grid w-full gap-2 sm:w-48">
                  <span className="text-sm font-medium">Rol</span>
                  <Select
                    value={allowRole}
                    onValueChange={(v) => setAllowRole(v as OrgRole)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ROLE_LABEL) as OrgRole[]).map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  disabled={addAllow.isPending || !allowEmail.trim()}
                  onClick={() => addAllow.mutate()}
                >
                  Autorizar correo
                </Button>
              </div>

              {allowlist.isLoading ? (
                <p className="text-sm text-muted-foreground">Cargando lista…</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Correo</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead className="w-[80px] text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(allowlist.data ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="h-20 text-center text-muted-foreground"
                        >
                          Nadie pendiente de primer acceso.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (allowlist.data ?? []).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.email}</TableCell>
                          <TableCell>{ROLE_LABEL[row.role]}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Quitar"
                              onClick={() => delAllow.mutate(row.id)}
                              disabled={delAllow.isPending}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Selecciona una empresa para ver o agregar correos.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
