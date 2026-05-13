import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
export const Route = createFileRoute("/_app/avaliacoes")({ component: () => (
  <div className="p-8 max-w-7xl mx-auto space-y-6">
    <h1 className="text-2xl font-semibold tracking-tight">Avaliações</h1>
    <Card className="p-12 text-center text-sm text-muted-foreground">Em construção.</Card>
  </div>
)});
