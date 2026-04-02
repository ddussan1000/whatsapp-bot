import { useState } from "react";
import { Link2, Megaphone, MousePointerClick, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  InfoModal,
  InfoSection,
  InfoStep,
  InfoCode,
  InfoAlert,
} from "@/components/ui/info-modal";
import {
  useCreateFlowReferralMutation,
  useFlowReferralsQuery,
  useFlowsV2Query,
} from "@/lib/hooks";

function HowItWorksModal() {
  return (
    <InfoModal
      title="¿Cómo funcionan los anuncios CTWA?"
      triggerLabel="¿Cómo funciona?"
    >
      <InfoSection title="¿Qué es un anuncio CTWA?">
        <p>
          CTWA significa <strong>Click-to-WhatsApp</strong>. Son anuncios de
          Instagram o Facebook que, al hacer click, abren directamente un chat
          de WhatsApp con tu número.
        </p>
      </InfoSection>

      <InfoSection title="¿Por qué conectarlos con flows?">
        <p>
          Cada anuncio puede llevar a un flow diferente. Si tenés un anuncio
          para un producto A y otro para el producto B, podés hacer que el bot
          salude de forma distinta según de cuál anuncio viene el cliente.
        </p>
      </InfoSection>

      <InfoSection title="¿Qué es el ctwa_clid?">
        <p>
          Es un identificador único que Meta genera cuando alguien hace click en
          tu anuncio. Llega en el primer mensaje del cliente junto con otros
          datos del anuncio (titular, texto, etc.).
        </p>
        <p className="mt-1">
          La plataforma lo registra automáticamente en la tabla de{" "}
          <strong>Reportes → Anuncios</strong>. Podés copiarlo de ahí.
        </p>
      </InfoSection>

      <InfoSection title="Cómo conectar un anuncio con un flow">
        <div className="flex flex-col gap-2 mt-1">
          <InfoStep n={1}>
            Lanzá tu anuncio CTWA en Meta Ads Manager apuntando a tu número de
            WhatsApp.
          </InfoStep>
          <InfoStep n={2}>
            Enviá un mensaje desde el anuncio (hacé click en él desde tu celular
            o pedile a alguien que lo haga).
          </InfoStep>
          <InfoStep n={3}>
            En <strong>Reportes → Anuncios</strong> vas a ver el registro con el{" "}
            <InfoCode>source_id</InfoCode> y el <InfoCode>ctwa_clid</InfoCode>{" "}
            del anuncio.
          </InfoStep>
          <InfoStep n={4}>
            Copiá el <InfoCode>ctwa_clid</InfoCode>, pegálo en el formulario de
            abajo y seleccioná el flow que querés que use ese anuncio.
          </InfoStep>
        </div>
      </InfoSection>

      <InfoAlert>
        Si no conectás un anuncio con ningún flow, el bot va a usar el flow por
        defecto asignado al número de WhatsApp.
      </InfoAlert>
    </InfoModal>
  );
}

export function ReferralsPage() {
  const [ctwaClid, setCtwaClid] = useState("");
  const [flowId, setFlowId] = useState("");

  const flows = useFlowsV2Query();
  const referrals = useFlowReferralsQuery();
  const createReferral = useCreateFlowReferralMutation();

  const flowMap = new Map((flows.data ?? []).map((f) => [f.id, f.name]));

  const handleSave = () => {
    if (!ctwaClid.trim() || !flowId) {
      toast.error("Completá el ctwa_clid y seleccioná un flow.");
      return;
    }
    createReferral.mutate(
      { ctwaClid: ctwaClid.trim(), flowId },
      {
        onSuccess: () => {
          toast.success("Conexión guardada.");
          setCtwaClid("");
          setFlowId("");
        },
        onError: (e) => toast.error(`Error: ${(e as Error).message}`),
      }
    );
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Megaphone size={20} className="text-primary" />
            <h2 className="text-2xl font-semibold">Anuncios CTWA</h2>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Conectá tus anuncios de Click-to-WhatsApp con flows específicos.
          </p>
        </div>
        <HowItWorksModal />
      </div>

      {/* How it works — inline summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            icon: MousePointerClick,
            title: "Cliente hace click en el anuncio",
            desc: "Meta abre WhatsApp y el bot recibe el mensaje junto con el ID del anuncio.",
            color: "text-blue-500",
          },
          {
            icon: Link2,
            title: "Plataforma detecta el anuncio",
            desc: "Registra automáticamente el ctwa_clid y los datos del anuncio en Reportes.",
            color: "text-violet-500",
          },
          {
            icon: Workflow,
            title: "Flow personalizado",
            desc: "Si el anuncio está conectado a un flow, el bot arranca con ese flow en vez del por defecto.",
            color: "text-emerald-500",
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="flex gap-3 rounded-xl border bg-card p-4"
            >
              <Icon size={18} className={`${item.color} shrink-0 mt-0.5`} />
              <div className="flex flex-col gap-0.5">
                <p className="text-xs font-semibold">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create mapping */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 size={15} />
            Conectar anuncio con flow
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Encontrás el{" "}
            <code className="text-xs bg-muted px-1 rounded">ctwa_clid</code> en{" "}
            <strong>Reportes → sección Anuncios</strong> después de que alguien
            haga click en tu anuncio.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-xs font-semibold">
              ctwa_clid del anuncio
            </label>
            <Input
              placeholder="ARAkLkA8rmlH8W3y…"
              value={ctwaClid}
              onChange={(e) => setCtwaClid(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-xs font-semibold">Flow a activar</label>
            <Select value={flowId} onValueChange={setFlowId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccioná un flow" />
              </SelectTrigger>
              <SelectContent>
                {(flows.data ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    <span className="flex items-center gap-2">
                      {f.is_active ? (
                        <Badge
                          variant="default"
                          className="text-[9px] px-1 py-0"
                        >
                          Activo
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0"
                        >
                          Inactivo
                        </Badge>
                      )}
                      {f.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="sm:mb-0"
            loading={createReferral.isPending}
            loadingText="Guardando..."
            onClick={handleSave}
          >
            Guardar
          </Button>
        </CardContent>
      </Card>

      {/* Mappings table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Conexiones configuradas</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ctwa_clid</TableHead>
                <TableHead>Flow asignado</TableHead>
                <TableHead>Anuncio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referrals.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 3 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (referrals.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center">
                    <Megaphone
                      size={28}
                      className="mx-auto mb-2 text-muted-foreground/30"
                    />
                    <p className="text-sm text-muted-foreground">
                      Todavía no hay conexiones configuradas.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Lanzá un anuncio CTWA y conectálo con un flow usando el
                      formulario de arriba.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                (referrals.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-[180px] truncate">
                      {r.ctwa_clid}
                    </TableCell>
                    <TableCell>
                      {r.flow_id ? (
                        <span className="flex items-center gap-1.5 text-sm">
                          <Workflow
                            size={13}
                            className="text-emerald-500 shrink-0"
                          />
                          {flowMap.get(r.flow_id) ?? r.flow_id}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          Sin flow
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {(r as { headline?: string }).headline ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
