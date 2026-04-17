import { Workflow, BarChart2, CreditCard } from "lucide-react";
import { Link } from "react-router-dom";
import { LoginForm } from "@/components/login-form";
import { ModeToggle } from "@/components/mode-toggle";

export function LoginPage() {
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-background">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,hsl(var(--primary)/0.12),transparent)]" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-[11px] font-bold text-primary-foreground shadow-sm">
            D
          </div>
          <span className="text-sm font-semibold tracking-tight text-foreground/70">
            DSS Bot
          </span>
        </div>
        <ModeToggle />
      </header>

      {/* Main content */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-20 pt-6">
        <div className="flex w-full max-w-sm flex-col gap-8">
          {/* Branding block */}
          <div className="flex flex-col items-center gap-4 text-center">
            {/* Logo */}
            <div className="relative">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-2xl font-bold tracking-tight text-primary-foreground shadow-lg ring-1 ring-primary/20">
                DS
              </div>
              {/* WhatsApp dot */}
              <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 ring-2 ring-background shadow-sm">
                <svg
                  viewBox="0 0 24 24"
                  fill="white"
                  className="h-3 w-3"
                  aria-hidden
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                DSS Bot
              </h1>
              <p className="text-base text-muted-foreground">
                Automatización de WhatsApp para tu negocio
              </p>
            </div>
          </div>

          {/* Login card */}
          <div className="rounded-2xl border border-border/60 bg-card/80 p-6 shadow-xl shadow-black/5 ring-1 ring-border/30 backdrop-blur-sm">
            <div className="mb-5 flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-foreground">
                Iniciar sesión
              </h2>
              <p className="text-sm text-muted-foreground">
                Accede con tu cuenta de Google para continuar.
              </p>
            </div>

            <LoginForm className="mb-2" />

            <p className="text-center text-xs text-muted-foreground/70 leading-relaxed">
              Al continuar, aceptas el uso de tu cuenta de Google para
              autenticarte de forma segura en la plataforma.
            </p>
          </div>

          {/* Features hint */}
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { icon: Workflow, label: "Flujos automáticos" },
              { icon: BarChart2, label: "Reportes en tiempo real" },
              { icon: CreditCard, label: "Gestión de pagos" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-border/40 bg-muted/30 px-2 py-3"
              >
                <Icon size={20} className="text-primary/70" />
                <span className="text-[11px] font-medium text-muted-foreground leading-tight">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 pb-6 text-center space-y-2">
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground/60">
          <Link
            to="/privacy"
            className="hover:text-muted-foreground transition-colors"
          >
            Política de Privacidad
          </Link>
          <span>·</span>
          <Link
            to="/terms"
            className="hover:text-muted-foreground transition-colors"
          >
            Términos de Servicio
          </Link>
        </div>
        <p className="text-xs text-muted-foreground/50">
          © {new Date().getFullYear()} DSS Bot · Todos los derechos reservados
        </p>
      </footer>
    </div>
  );
}
