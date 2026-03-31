import { useMemo, useState } from "react";
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
import {
  useCampaignsQuery,
  useCreateCampaignMutation,
  useUpdateCampaignMutation,
} from "@/lib/hooks";
import type { Campaign } from "@/types/api";
import {
  getActiveCampaignId,
  setActiveCampaignId,
} from "@/lib/active-campaign";
import { getActiveProductId } from "@/lib/active-product";

function campaignStatusVariant(
  status: Campaign["status"]
): "default" | "secondary" | "outline" | "ghost" {
  switch (status) {
    case "active":
      return "default";
    case "draft":
      return "secondary";
    case "paused":
      return "outline";
    case "archived":
      return "ghost";
    default:
      return "outline";
  }
}

const STATUS_LABEL: Record<Campaign["status"], string> = {
  draft: "Borrador",
  active: "Activa",
  paused: "Pausada",
  archived: "Archivada",
};

export function CampaignsPage() {
  const [name, setName] = useState("");
  const [activeId, setActiveId] = useState(() => getActiveCampaignId());
  const campaigns = useCampaignsQuery();
  const createCampaign = useCreateCampaignMutation();
  const updateCampaign = useUpdateCampaignMutation();
  const activeProductId = getActiveProductId();

  const activeCampaign = useMemo(
    () => (campaigns.data ?? []).find((c) => c.id === activeId),
    [activeId, campaigns.data]
  );

  const setAsActive = (campaign: Campaign) => {
    setActiveCampaignId(campaign.id);
    setActiveId(campaign.id);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Campañas</h2>
        <p className="text-sm text-muted-foreground">
          Crea campañas y elige la activa para flujos y plantillas.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nueva campaña</CardTitle>
          <CardDescription>
            Queda en borrador hasta que la publiques desde la tabla.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              className="max-w-md"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Campaña Q2 WhatsApp"
            />
            <Button
              disabled={createCampaign.isPending || !name.trim()}
              onClick={() => {
                if (!name.trim()) return;
                createCampaign.mutate({
                  name: name.trim(),
                  status: "draft",
                  productId: activeProductId || undefined,
                });
                setName("");
              }}
            >
              {createCampaign.isPending ? "Creando…" : "Crear"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Campaña activa</span>
            {activeCampaign ? (
              <>
                <span className="font-medium">{activeCampaign.name}</span>
                <Badge variant={campaignStatusVariant(activeCampaign.status)}>
                  {STATUS_LABEL[activeCampaign.status]}
                </Badge>
              </>
            ) : (
              <Badge variant="outline">Ninguna seleccionada</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
          <CardDescription>
            Activa una campaña para usarla en Flows y Plantillas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns.error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                No se pudieron cargar las campañas.
              </AlertDescription>
            </Alert>
          )}
          {campaigns.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(campaigns.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No hay campañas. Crea una arriba.
                    </TableCell>
                  </TableRow>
                ) : (
                  (campaigns.data ?? []).map((campaign) => (
                    <TableRow
                      key={campaign.id}
                      data-state={
                        campaign.id === activeId ? "selected" : undefined
                      }
                    >
                      <TableCell className="font-medium">
                        {campaign.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant={campaignStatusVariant(campaign.status)}>
                          {STATUS_LABEL[campaign.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {campaign.product ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant={
                              campaign.id === activeId ? "default" : "outline"
                            }
                            onClick={() => setAsActive(campaign)}
                          >
                            {campaign.id === activeId ? "Activa" : "Activar"}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={updateCampaign.isPending}
                            onClick={() =>
                              updateCampaign.mutate({
                                id: campaign.id,
                                payload: {
                                  status:
                                    campaign.status === "active"
                                      ? "paused"
                                      : "active",
                                },
                              })
                            }
                          >
                            {campaign.status === "active"
                              ? "Pausar"
                              : "Publicar"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
