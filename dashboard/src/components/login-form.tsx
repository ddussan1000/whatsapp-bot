import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [email, setEmail] = React.useState("");
  const [pending, setPending] = React.useState<"google" | "email" | null>(null);

  const onGoogle = async () => {
    if (!supabase) {
      toast.error("Falta configuración", {
        description:
          "Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el entorno del panel.",
      });
      return;
    }
    setPending("google");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) {
        toast.error("No se pudo usar Google", {
          description: error.message,
        });
      }
    } finally {
      setPending(null);
    }
  };

  const onMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      toast.error("Falta configuración", {
        description:
          "Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el entorno del panel.",
      });
      return;
    }
    const trimmed = email.trim();
    if (!trimmed) return;
    setPending("email");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) {
        toast.error("No pudimos enviar el correo", {
          description: error.message,
        });
        return;
      }
      toast.success("Revisa tu bandeja de entrada", {
        description:
          "Te enviamos un enlace para entrar. Si no lo ves, revisa spam o promociones.",
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <div className={cn("w-full", className)} {...props}>
      <Card className="border-border/80 shadow-lg shadow-black/5 ring-1 ring-border/40 dark:shadow-black/20 dark:ring-border/60">
        <CardHeader className="space-y-1 pb-4 text-center sm:text-left">
          <CardTitle className="text-xl font-semibold tracking-tight text-center">
            Bienvenido
          </CardTitle>
          <CardDescription className="text-pretty text-sm leading-relaxed">
            Entrá con Google o recibí un enlace seguro en tu correo. Sin
            contraseña que recordar.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-2">
          <form onSubmit={onMagicLink} className="space-y-1">
            <FieldGroup>
              <Field>
                <Button
                  variant="outline"
                  type="button"
                  className="h-11 w-full gap-2 border-border/80 bg-background/80 text-[15px] font-medium shadow-sm"
                  disabled={pending !== null}
                  onClick={onGoogle}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    className="size-[18px] shrink-0"
                  >
                    <path
                      d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                      fill="currentColor"
                    />
                  </svg>
                  {pending === "google"
                    ? "Abriendo Google…"
                    : "Continuar con Google"}
                </Button>
              </Field>

              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                o con tu correo
              </FieldSeparator>

              <Field>
                <FieldLabel htmlFor="login-email" className="text-foreground">
                  Correo electrónico
                </FieldLabel>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="nombre@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={pending !== null}
                  className="h-11"
                />
              </Field>

              <Field>
                <Button
                  type="submit"
                  className="h-11 w-full text-[15px] font-medium"
                  disabled={pending !== null || !email.trim()}
                >
                  {pending === "email"
                    ? "Enviando enlace…"
                    : "Enviar enlace de acceso"}
                </Button>
                <FieldDescription className="text-center sm:text-left">
                  Te llegará un enlace de un solo uso; al abrirlo quedarás
                  dentro del panel.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-1 bg-muted/30 px-3 py-4 sm:px-4">
          <p className="text-center text-xs leading-normal text-muted-foreground">
            Al continuar aceptás el acceso mediante Supabase (Google o enlace
            por correo) según las políticas de tu organización.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
