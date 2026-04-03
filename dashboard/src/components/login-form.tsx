import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [pending, setPending] = React.useState(false);

  const onGoogle = async () => {
    if (!supabase) {
      toast.error("Falta configuración", {
        description:
          "Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el entorno del panel.",
      });
      return;
    }
    setPending(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) {
        toast.error("No se pudo iniciar sesión con Google", {
          description: error.message,
        });
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={cn("w-full", className)} {...props}>
      <Button
        variant="outline"
        type="button"
        size="lg"
        className="h-12 w-full gap-3 border-border/80 bg-background/80 text-base font-medium shadow-sm hover:bg-muted/60"
        disabled={pending}
        onClick={onGoogle}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="size-5 shrink-0"
        >
          <path
            d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
            fill="currentColor"
          />
        </svg>
        {pending ? "Abriendo Google…" : "Continuar con Google"}
      </Button>
    </div>
  );
}
