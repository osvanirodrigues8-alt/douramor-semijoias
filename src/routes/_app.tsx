import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { LayoutDashboard, Package, ShoppingBag, Calendar, Users, Tag, BarChart3, Bot, Settings, LogOut, Star, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/produtos", label: "Produtos", icon: Package },
  { to: "/pedidos", label: "Pedidos", icon: ShoppingBag },
  { to: "/agendamentos", label: "Agendamentos", icon: Calendar },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/cupons", label: "Cupons", icon: Tag },
  { to: "/avaliacoes", label: "Avaliações", icon: Star },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
];

const navAgent = [
  { to: "/agente", label: "Agente IA", icon: Bot },
  { to: "/integracoes/nuvemshop", label: "Nuvemshop", icon: Plug },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

function AppLayout() {
  const { session, loading, signOut, user, role } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!session) {
    navigate({ to: "/login" });
    return null;
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 border-r flex flex-col sticky top-0 h-screen">
        <div className="p-6 flex items-center gap-2">
          <div className="size-6 rounded-sm bg-brand ring-1 ring-brand/20" />
          <span className="text-sm font-semibold tracking-tight">Douramor Semi Joias</span>
        </div>

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {nav.map((i) => (
            <NavItem key={i.to} to={i.to} label={i.label} Icon={i.icon} active={path.startsWith(i.to)} />
          ))}
          <div className="py-3"><div className="h-px bg-border" /></div>
          {navAgent.map((i) => (
            <NavItem key={i.to} to={i.to} label={i.label} Icon={i.icon} active={path.startsWith(i.to)} />
          ))}
        </nav>

        <div className="p-4 border-t">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="size-8 rounded-full bg-muted grid place-items-center text-[10px] font-medium uppercase">
              {(user?.email ?? "?").slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{user?.email}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{role ?? "—"}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => signOut()} title="Sair">
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, label, Icon, active }: { to: string; label: string; Icon: any; active: boolean }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${
        active ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
      }`}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </Link>
  );
}
