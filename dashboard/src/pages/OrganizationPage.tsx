import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  useCreateInviteMutation,
  useCurrentOrgQuery,
  useInvitesQuery,
} from "@/lib/hooks";
import type { OrgRole } from "@/types/api";

function inviteStatusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "accepted":
      return "default";
    case "pending":
      return "secondary";
    case "revoked":
    case "expired":
      return "destructive";
    default:
      return "outline";
  }
}

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Propietario",
  admin: "Administrador",
  agent: "Agente",
  viewer: "Solo lectura",
};

export function OrganizationPage() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("agent");
  const org = useCurrentOrgQuery();
  const invites = useInvitesQuery();
  const createInvite = useCreateInviteMutation();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Empresa y equipo
        </h2>
        <p className="text-sm text-muted-foreground">
          Organización activa e invitaciones pendientes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organización activa</CardTitle>
          <CardDescription>
            Contexto usado en conversaciones, campañas y reportes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {org.isLoading ? (
            <Skeleton className="h-8 w-64" />
          ) : org.error ? (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                No se pudo cargar la organización.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <p className="text-lg font-medium">
                {org.data?.organization.name}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Slug</span>
                <Badge variant="outline">{org.data?.organization.slug}</Badge>
                <Separator
                  orientation="vertical"
                  className="hidden h-4 sm:inline-flex"
                />
                <span className="text-sm text-muted-foreground">Tu rol</span>
                <Badge>
                  {org.data?.membership.role
                    ? ROLE_LABELS[org.data.membership.role]
                    : "—"}
                </Badge>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invitar usuario</CardTitle>
          <CardDescription>
            Se crea una invitación por correo (gestión en base de datos).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="grid w-full gap-2 sm:max-w-md">
              <label htmlFor="invite-email" className="text-sm font-medium">
                Correo
              </label>
              <Input
                id="invite-email"
                type="email"
                placeholder="correo@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid w-full gap-2 sm:w-48">
              <span className="text-sm font-medium">Rol</span>
              <Select value={role} onValueChange={(v) => setRole(v as OrgRole)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Rol" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as OrgRole[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="sm:shrink-0"
              disabled={createInvite.isPending || !email.trim()}
              onClick={() => {
                if (!email.trim()) return;
                createInvite.mutate({ email: email.trim(), role });
                setEmail("");
              }}
            >
              {createInvite.isPending ? "Enviando…" : "Invitar"}
            </Button>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-medium">Invitaciones</h3>
            {invites.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Correo</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(invites.data ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="h-24 text-center text-muted-foreground"
                      >
                        No hay invitaciones.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (invites.data ?? []).map((invite) => (
                      <TableRow key={invite.id}>
                        <TableCell className="font-medium">
                          {invite.email}
                        </TableCell>
                        <TableCell>
                          {ROLE_LABELS[invite.role] ?? invite.role}
                        </TableCell>
                        <TableCell>
                          <Badge variant={inviteStatusVariant(invite.status)}>
                            {invite.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
