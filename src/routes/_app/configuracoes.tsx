import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
export const Route = createFileRoute("/_app/configuracoes")({ component: () => (
  <div className="p-8 max-w-7xl mx-auto space-y-6">
    <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
    <Card className="p-12 text-center text-sm text-muted-foreground">Em construção — abas de identidade, comportamento, pagamento, atendimento e integrações virão na próxima iteração.</Card>
  </div>
)});
