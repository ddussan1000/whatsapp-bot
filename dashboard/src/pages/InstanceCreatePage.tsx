import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useCreateInstanceMutation } from "@/lib/hooks";

function Field({
  label,
  hint,
  required,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-1.5">
        <Label className="text-sm font-semibold">{label}</Label>
        {required && (
          <span className="text-xs text-destructive">Requerido</span>
        )}
        {optional && (
          <span className="text-xs text-muted-foreground">(opcional)</span>
        )}
      </div>
      {children}
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function InstanceCreatePage() {
  const navigate = useNavigate();
  const createInstance = useCreateInstanceMutation();
  const [label, setLabel] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [metaToken, setMetaToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [metaAppId, setMetaAppId] = useState("");
  const [displayPhone, setDisplayPhone] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const submit = () => {
    if (!label.trim() || !phoneNumberId.trim() || !metaToken.trim()) {
      toast.error(
        "Nombre, Phone Number ID y Token de acceso son obligatorios."
      );
      return;
    }
    createInstance.mutate(
      {
        label: label.trim(),
        phoneNumberId: phoneNumberId.trim(),
        metaToken: metaToken.trim(),
        appSecret: appSecret.trim() || undefined,
        wabaId: wabaId.trim() || undefined,
        metaAppId: metaAppId.trim() || undefined,
        displayPhoneNumber: displayPhone.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Número agregado correctamente.");
          navigate("/instances");
        },
        onError: (e) => toast.error(`Error: ${(e as Error).message}`),
      }
    );
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={() => navigate("/instances")}
          className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} />
          Volver a WhatsApp
        </button>
        <h2 className="text-2xl font-semibold">Agregar número de WhatsApp</h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Completá los datos que encontrás en{" "}
          <span className="font-medium text-foreground">
            Meta for Developers
          </span>{" "}
          dentro de tu aplicación. Podés dejar los campos opcionales para
          después.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identificación</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field
              label="Nombre del número"
              required
              hint="Solo para reconocerlo en el panel. El cliente no lo ve."
            >
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ej: Línea principal, Ventas, Soporte…"
              />
            </Field>
            <Field
              label="Número de teléfono"
              optional
              hint="Con formato internacional. Ej: +57 300 123 4567"
            >
              <Input
                value={displayPhone}
                onChange={(e) => setDisplayPhone(e.target.value)}
                placeholder="+57 300 123 4567"
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Credenciales de Meta</CardTitle>
            <p className="text-sm text-muted-foreground">
              Los encontrás en{" "}
              <span className="font-medium text-foreground">
                Meta for Developers → tu app → WhatsApp → API Setup
              </span>
              .
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field
              label="Phone Number ID"
              required
              hint="Identificador único del número en Meta. Está en la sección 'API Setup', justo debajo del número."
            >
              <Input
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="123456789012345"
                className="font-mono"
              />
            </Field>

            <Field
              label="Token de acceso"
              required
              hint='Token permanente de Meta para enviar mensajes con permisos "whatsapp_business_messaging", "whatsapp_business_management" y "ads_read".'
            >
              <div className="flex gap-2">
                <Input
                  type={showToken ? "text" : "password"}
                  value={metaToken}
                  onChange={(e) => setMetaToken(e.target.value)}
                  placeholder="EAAP…"
                  className="flex-1 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="rounded-md border bg-background px-2.5 text-muted-foreground hover:bg-muted"
                >
                  {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </Field>

            <Field
              label="App Secret"
              optional
              hint="Meta for Developers → tu app → App Settings → Basic → App Secret. Activa la verificación de firma en webhooks entrantes."
            >
              <div className="flex gap-2">
                <Input
                  type={showSecret ? "text" : "password"}
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  placeholder="abc123…"
                  className="flex-1 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  className="rounded-md border bg-background px-2.5 text-muted-foreground hover:bg-muted"
                >
                  {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </Field>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="WABA ID"
                optional
                hint="ID de tu cuenta de WhatsApp Business."
              >
                <Input
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                  placeholder="123456789"
                  className="font-mono"
                />
              </Field>
              <Field
                label="Meta App ID"
                optional
                hint="ID de tu app en Meta for Developers."
              >
                <Input
                  value={metaAppId}
                  onChange={(e) => setMetaAppId(e.target.value)}
                  placeholder="987654321"
                  className="font-mono"
                />
              </Field>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => navigate("/instances")}>
          Cancelar
        </Button>
        <Button
          onClick={submit}
          loading={createInstance.isPending}
          loadingText="Guardando…"
          disabled={!label.trim() || !phoneNumberId.trim() || !metaToken.trim()}
        >
          Agregar número
        </Button>
      </div>
    </div>
  );
}
