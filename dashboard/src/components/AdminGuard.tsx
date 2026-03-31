import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { useSessionQuery } from "@/lib/hooks";

export function AdminGuard({ children }: { children: ReactElement }) {
  const { data, isLoading, isError } = useSessionQuery();

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Verificando permisos…</p>
      </div>
    );
  }

  if (isError || !data?.isPlatformAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}
