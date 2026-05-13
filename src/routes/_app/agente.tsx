import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
export const Route = createFileRoute("/_app/agente")({ component: () => (
  <div className="p-8 max-w-7xl mx-auto space-y-6">
    <h1 className="text-2xl font-semibold tracking-tight">Agente IA</h1>
    <Card className="p-12 text-center text-sm text-muted-foreground">Em construção — fluxo conversacional virá na próxima iteração.</Card>
  </div>
)});
