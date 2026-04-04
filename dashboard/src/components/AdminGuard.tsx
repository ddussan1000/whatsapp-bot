import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { useSessionQuery } from "@/lib/hooks";
import { SessionLoader } from "./SessionLoader";

export function AdminGuard({ children }: { children: ReactElement }) {
  const { data, isLoading, isError } = useSessionQuery();

  if (isLoading) {
    return <SessionLoader message="Verificando permisos…" />;
  }

  if (isError || !data?.isPlatformAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}
