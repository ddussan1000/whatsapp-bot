import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  useCreateFlowReferralMutation,
  useFlowReferralsQuery,
  useFlowsV2Query,
} from "@/lib/hooks";

export function ReferralsPage() {
  const [ctwaClid, setCtwaClid] = useState("");
  const [flowId, setFlowId] = useState("");
  const flows = useFlowsV2Query();
  const referrals = useFlowReferralsQuery();
  const createReferral = useCreateFlowReferralMutation();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Mapping CTWA</h2>
      <Card>
        <CardHeader>
          <CardTitle>Vincular click-id con flow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="ctwa_clid"
            value={ctwaClid}
            onChange={(e) => setCtwaClid(e.target.value)}
          />
          <Select value={flowId} onValueChange={setFlowId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona flow" />
            </SelectTrigger>
            <SelectContent>
              {(flows.data ?? []).map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            loading={createReferral.isPending}
            loadingText="Guardando..."
            onClick={() => {
              if (!ctwaClid.trim() || !flowId) return;
              createReferral.mutate({ ctwaClid: ctwaClid.trim(), flowId });
              setCtwaClid("");
            }}
          >
            Guardar mapping
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mappings actuales</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ctwa_clid</TableHead>
                <TableHead>flow_id</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referrals.isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={2}
                    className="text-center text-muted-foreground"
                  >
                    Cargando mappings...
                  </TableCell>
                </TableRow>
              ) : (referrals.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={2}
                    className="text-center text-muted-foreground"
                  >
                    No hay mappings creados todavía.
                  </TableCell>
                </TableRow>
              ) : (
                (referrals.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.ctwa_clid}</TableCell>
                    <TableCell>{r.flow_id}</TableCell>
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
