import { useState } from "react";
import {
  LayoutDashboard,
  MessagesSquare,
  Receipt,
  BarChart3,
  Building2,
  Workflow,
  Library,
  Link2,
  Smartphone,
  BookOpenText,
  Menu,
  LogOut,
  Shield,
  Images,
  Settings2,
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
import { supabase } from "@/lib/supabase";
import { setActiveOrgId } from "@/lib/api";
import { useSessionQuery } from "@/lib/hooks";

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

// ── Nav link items ────────────────────────────────────────────────────────

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
  { to: "/referrals", label: "CTWA Ads", icon: Link2 },
];

const systemLinks: NavItem[] = [
  { to: "/instances", label: "WhatsApp", icon: Smartphone },
  { to: "/organization", label: "Equipo", icon: Building2 },
  { to: "/config", label: "Configuración", icon: Settings2 },
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

function SidebarContent({
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

// ── AppLayout ─────────────────────────────────────────────────────────────

export function AppLayout() {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

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
      <aside className="sidebar" aria-label="Navegación principal">
        <div className="brand">
          <div className="brand-dot" />
          <div>
            <h1>Sales Bot</h1>
            <p>Admin Console</p>
          </div>
        </div>
        <nav
          className="sidebar-nav flex-1 overflow-y-auto"
          aria-label="Secciones"
        >
          <SidebarContent />
        </nav>
        <div className="sidebar-footer">
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={openLogoutDialog}
          >
            <LogOut size={16} />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="topbar-start">
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
                  <SheetTitle className="font-heading">Menú</SheetTitle>
                </SheetHeader>
                <nav
                  className="flex flex-1 flex-col gap-1 overflow-y-auto p-3"
                  aria-label="Navegación móvil"
                >
                  <SidebarContent
                    onNavigate={() => setMobileOpen(false)}
                    popover
                  />
                </nav>
                <SheetFooter className="border-t border-border sm:flex-col">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-center gap-2"
                    onClick={() => {
                      setMobileOpen(false);
                      openLogoutDialog();
                    }}
                  >
                    <LogOut size={16} />
                    Cerrar sesión
                  </Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
            <div>
              <p className="topbar-title">Dashboard</p>
              <p className="muted">Operación en tiempo real</p>
            </div>
          </div>
          <div className="topbar-actions">
            <ModeToggle />
          </div>
        </header>
        <Outlet />
      </main>

      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cerrar sesión</DialogTitle>
            <DialogDescription>
              ¿Seguro que querés salir? Vas a tener que volver a iniciar sesión
              para entrar al panel.
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
