import { useState } from "react";
import {
  LayoutDashboard,
  MessagesSquare,
  Receipt,
  BarChart3,
  Building2,
  Workflow,
  Library,
  Smartphone,
  BookOpenText,
  Menu,
  LogOut,
  Shield,
  Images,
  Settings2,
  ChevronsUpDown,
  Zap,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { ModeToggle } from "../components/mode-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/lib/supabase";
import { setActiveOrgId } from "@/lib/api";
import {
  useCurrentOrgQuery,
  useSessionQuery,
  useSupabaseUser,
} from "@/lib/hooks";

// ── Nav section ───────────────────────────────────────────────────────────

function NavSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
        {label}
      </p>
      {children}
    </div>
  );
}

type NavItem = { to: string; label: string; icon: React.ElementType };

const operationsLinks: NavItem[] = [
  { to: "/", label: "Resumen", icon: LayoutDashboard },
  { to: "/conversations", label: "Conversaciones", icon: MessagesSquare },
  { to: "/payments", label: "Pagos", icon: Receipt },
  { to: "/reports", label: "Reportes", icon: BarChart3 },
];

const productLinks: NavItem[] = [
  { to: "/flows", label: "Flujos", icon: Workflow },
  { to: "/media", label: "Media", icon: Images },
  { to: "/templates", label: "Plantillas", icon: Library },
];

const systemLinks: NavItem[] = [
  { to: "/instances", label: "WhatsApp", icon: Smartphone },
  { to: "/organization", label: "Organización", icon: Building2 },
  { to: "/config", label: "Configuración Bot", icon: Settings2 },
  { to: "/instructions", label: "Guía de inicio", icon: BookOpenText },
];

function NavItem({
  item,
  onNavigate,
  popover = false,
}: {
  item: NavItem;
  onNavigate?: () => void;
  popover?: boolean;
}) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={popover ? "nav-link nav-link-popover" : "nav-link"}
      onClick={onNavigate}
    >
      <Icon size={16} />
      <span>{item.label}</span>
    </NavLink>
  );
}

function NavLinks({
  onNavigate,
  popover = false,
}: {
  onNavigate?: () => void;
  popover?: boolean;
}) {
  const { data: sessionInfo } = useSessionQuery();

  return (
    <div className="flex flex-col gap-0">
      <NavSection label="Operaciones">
        {operationsLinks.map((l) => (
          <NavItem
            key={l.to}
            item={l}
            onNavigate={onNavigate}
            popover={popover}
          />
        ))}
      </NavSection>
      <NavSection label="Automatización">
        {productLinks.map((l) => (
          <NavItem
            key={l.to}
            item={l}
            onNavigate={onNavigate}
            popover={popover}
          />
        ))}
      </NavSection>
      <NavSection label="Sistema">
        {systemLinks.map((l) => (
          <NavItem
            key={l.to}
            item={l}
            onNavigate={onNavigate}
            popover={popover}
          />
        ))}
        {sessionInfo?.isPlatformAdmin && (
          <NavItem
            item={{ to: "/admin", label: "Plataforma", icon: Shield }}
            onNavigate={onNavigate}
            popover={popover}
          />
        )}
      </NavSection>
    </div>
  );
}

// ── NavUser ───────────────────────────────────────────────────────────────

function NavUser({ onLogout }: { onLogout: () => void }) {
  const { data: supaUser } = useSupabaseUser();
  const { data: org } = useCurrentOrgQuery();

  const meta = supaUser?.user_metadata as
    | { avatar_url?: string; full_name?: string; name?: string }
    | undefined;

  const avatarUrl = meta?.avatar_url;
  const displayName =
    meta?.full_name ??
    meta?.name ??
    supaUser?.email?.split("@")[0] ??
    "Usuario";
  const email = supaUser?.email ?? "";
  const initials = displayName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none"
        >
          <Avatar className="h-8 w-8 shrink-0 rounded-lg">
            <AvatarImage src={avatarUrl} alt={displayName} />
            <AvatarFallback className="rounded-lg bg-primary/20 text-primary text-xs font-semibold">
              {initials || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium leading-tight">
              {displayName}
            </p>
            {org?.organization.name && (
              <p className="truncate text-[11px] text-muted-foreground/70 leading-tight">
                {org.organization.name}
              </p>
            )}
          </div>
          <ChevronsUpDown
            size={14}
            className="shrink-0 text-muted-foreground/50"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={6}
        className="w-[--radix-dropdown-menu-trigger-width] min-w-52"
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar className="h-9 w-9 shrink-0 rounded-lg">
              <AvatarImage src={avatarUrl} alt={displayName} />
              <AvatarFallback className="rounded-lg bg-primary/20 text-primary text-xs font-semibold">
                {initials || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onLogout}
          className="text-destructive focus:text-destructive gap-2"
        >
          <LogOut size={14} />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── AppLayout ─────────────────────────────────────────────────────────────

export function AppLayout() {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { data: org } = useCurrentOrgQuery();

  const openLogoutDialog = () => setLogoutOpen(true);

  const confirmSignOut = async () => {
    setSigningOut(true);
    try {
      setActiveOrgId(null);
      await supabase?.auth.signOut();
      setLogoutOpen(false);
      setMobileOpen(false);
      navigate("/login", { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="app-shell">
      {/* ── Desktop sidebar ── */}
      <aside className="sidebar" aria-label="Navegación principal">
        {/* Brand */}
        <div className="brand">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
            <Zap size={16} className="text-primary" />
          </div>
          <div>
            <h1>DSS Bot</h1>
            <p className="text-[11px] text-muted-foreground/60 leading-none mt-0.5">
              {org?.organization.name ?? "Panel de control"}
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav
          className="sidebar-nav flex-1 overflow-y-auto"
          aria-label="Secciones"
        >
          <NavLinks />
        </nav>

        {/* User footer */}
        <div className="sidebar-footer">
          <NavUser onLogout={openLogoutDialog} />
        </div>
      </aside>

      {/* ── Content ── */}
      <main className="content">
        <header className="topbar">
          <div className="topbar-start">
            {/* Mobile menu trigger */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="mobile-menu-btn shrink-0"
                  aria-label="Abrir menú"
                >
                  <Menu size={18} />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="flex w-[min(100vw,280px)] flex-col gap-0 p-0 sm:max-w-[280px]"
              >
                <SheetHeader className="border-b border-border px-4 py-4 text-left">
                  <SheetTitle className="flex items-center gap-2">
                    <Zap size={15} className="text-primary" />
                    DSS Bot
                  </SheetTitle>
                </SheetHeader>
                <nav
                  className="flex flex-1 flex-col gap-1 overflow-y-auto p-3"
                  aria-label="Navegación móvil"
                >
                  <NavLinks onNavigate={() => setMobileOpen(false)} popover />
                </nav>
                <SheetFooter className="border-t border-border p-3 sm:flex-col">
                  <NavUser
                    onLogout={() => {
                      setMobileOpen(false);
                      openLogoutDialog();
                    }}
                  />
                </SheetFooter>
              </SheetContent>
            </Sheet>

            {/* Org context */}
            <div className="min-w-0">
              <p className="topbar-title truncate">
                {org?.organization.name ?? "DSS Bot"}
              </p>
              {org && (
                <p className="muted text-[11px] leading-none truncate capitalize">
                  {org.membership.role === "owner"
                    ? "Propietario"
                    : org.membership.role === "admin"
                      ? "Administrador"
                      : org.membership.role === "agent"
                        ? "Agente"
                        : "Solo lectura"}
                </p>
              )}
            </div>
          </div>
          <div className="topbar-actions">
            <ModeToggle />
          </div>
        </header>

        <div className="flex flex-1 flex-col min-h-0 overflow-x-hidden overflow-y-auto">
          <Outlet />
        </div>
      </main>

      {/* ── Logout confirm dialog ── */}
      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cerrar sesión</DialogTitle>
            <DialogDescription>
              ¿Seguro que querés salir? Tendrás que volver a iniciar sesión para
              acceder al panel.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLogoutOpen(false)}
              disabled={signingOut}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmSignOut()}
              disabled={signingOut}
            >
              {signingOut ? "Cerrando…" : "Cerrar sesión"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
