import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Package, ShoppingBag, Calendar, Users, Tag, BarChart3, Bot, Settings, LogOut, Star, Plug, AlertCircle, Workflow, Megaphone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/atendimento", label: "Atendimento", icon: AlertCircle, alertKey: "humano" as const },
  { to: "/produtos", label: "Produtos", icon: Package },
  { to: "/pedidos", label: "Pedidos", icon: ShoppingBag },
  { to: "/agendamentos", label: "Agendamentos", icon: Calendar },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/cupons", label: "Cupons", icon: Tag },
  { to: "/anuncios", label: "Anúncios Meta", icon: Megaphone },
  { to: "/avaliacoes", label: "Avaliações", icon: Star },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
];

const navAgent = [
  { to: "/agente", label: "Agente IA", icon: Bot },
  { to: "/melhorias", label: "Melhorias IA", icon: Sparkles },
  { to: "/fluxos", label: "Fluxos", icon: Workflow },
  { to: "/integracoes/nuvemshop", label: "Nuvemshop", icon: Plug },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

function AppLayout() {
  const { session, loading, signOut, user, role } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [humanoCount, setHumanoCount] = useState(0);

  useEffect(() => {
    if (!session) return;
    const refresh = async () => {
      const { count } = await supabase
        .from("conversas")
        .select("id", { count: "exact", head: true })
        .eq("precisa_humano", true);
      setHumanoCount(count ?? 0);
    };
    refresh();
    const ch = supabase
      .channel("sidebar-humano")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversas" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session]);

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
            <NavItem
              key={i.to}
              to={i.to}
              label={i.label}
              Icon={i.icon}
              active={path.startsWith(i.to)}
              badge={"alertKey" in i && i.alertKey === "humano" && humanoCount > 0 ? humanoCount : undefined}
            />
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

function NavItem({ to, label, Icon, active, badge }: { to: string; label: string; Icon: any; active: boolean; badge?: number }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${
        active ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
      }`}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold animate-pulse">
          {badge}
        </span>
      )}
    </Link>
  );
}
