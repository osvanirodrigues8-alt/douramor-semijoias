import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_app/produtos")({ component: () => <Stub title="Produtos" /> });

function Stub({ title }: { title: string }) {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <Card className="p-12 text-center text-sm text-muted-foreground">
        Em construção — esta seção será implementada na próxima iteração.
      </Card>
    </div>
  );
}
