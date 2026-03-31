import { ArrowLeft, Shield } from "lucide-react";
import { Link, Outlet } from "react-router-dom";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

export function AdminLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Shield className="size-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight">
              Administración de plataforma
            </p>
            <p className="truncate text-xs text-muted-foreground">
              Empresas y acceso de clientes
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/" className="gap-1.5">
              <ArrowLeft className="size-4" />
              Panel cliente
            </Link>
          </Button>
          <ModeToggle />
        </div>
      </header>
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}
