import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Star } from "lucide-react";

export const Route = createFileRoute("/_app/avaliacoes")({ component: Avaliacoes });

function Avaliacoes() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("avaliacoes").select("*, clientes(nome)").order("criado_em",{ascending:false}).then(({data}) => setItems(data ?? []));
  }, []);

  const media = items.length ? (items.reduce((s,i)=>s+i.nota,0) / items.length).toFixed(1) : "—";

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div><p className="text-xs text-muted-foreground">Pesquisa</p><h1 className="text-2xl font-semibold tracking-tight mt-1">Avaliações</h1></div>
        <Card className="px-5 py-3"><div className="text-xs text-muted-foreground">Nota média</div><div className="text-2xl font-semibold flex items-center gap-1">{media}<Star className="size-4 fill-warning text-warning" /></div></Card>
      </header>
      <div className="grid md:grid-cols-2 gap-4">
        {items.map((a) => (
          <Card key={a.id} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">{a.clientes?.nome ?? "Anônimo"}</span>
              <div className="flex">{Array.from({length:5}).map((_,i)=><Star key={i} className={`size-4 ${i<a.nota?"fill-warning text-warning":"text-muted-foreground/30"}`} />)}</div>
            </div>
            <p className="text-sm text-muted-foreground">{a.comentario ?? "Sem comentário"}</p>
            <div className="text-xs text-muted-foreground capitalize">{a.canal} · {new Date(a.criado_em).toLocaleDateString("pt-BR")}</div>
          </Card>
        ))}
        {!items.length && <Card className="p-12 text-center text-muted-foreground md:col-span-2">Nenhuma avaliação ainda.</Card>}
      </div>
    </div>
  );
}
