import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Upload, Pencil, Trash2, ImageIcon, LayoutGrid, List as ListIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/produtos")({ component: Produtos });

const CATS = [
  "anel",
  "colar",
  "brinco",
  "pulseira",
  "bracelete",
  "tornozeleira",
  "escapulario",
  "relogio",
  "oculos",
  "conjunto",
  "outro",
];
const CAT_LABEL: Record<string, string> = {
  anel: "Anéis",
  colar: "Colares",
  brinco: "Brincos",
  pulseira: "Pulseiras",
  bracelete: "Braceletes",
  tornozeleira: "Tornozeleiras",
  escapulario: "Escapulários",
  relogio: "Relógios",
  oculos: "Óculos",
  conjunto: "Conjuntos / Kits",
  outro: "Outros",
};
const PAGE_SIZE = 48;

function Produtos() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("todas");
  const [statusF, setStatusF] = useState<string>("todos");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("produtos")
      .select("*")
      .order("atualizado_em", { ascending: false })
      .limit(2000);
    setItems(data ?? []);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((i) => {
      if (term && !(`${i.nome} ${i.descricao ?? ""}`.toLowerCase().includes(term))) return false;
      if (cat !== "todas" && i.categoria !== cat) return false;
      if (statusF !== "todos" && i.status !== statusF) return false;
      return true;
    });
  }, [items, q, cat, statusF]);

  useEffect(() => {
    setPage(1);
  }, [q, cat, statusF, view]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const remove = async (id: string) => {
    if (!confirm("Excluir produto?")) return;
    const { error } = await supabase.from("produtos").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Excluído");
      load();
    }
  };

  const importCSV = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const header = lines.shift()!.split(",").map((h) => h.trim().toLowerCase());
    const rows = lines
      .map((l) => {
        const cols = l.split(",");
        const r: any = {};
        header.forEach((h, i) => (r[h] = cols[i]?.trim()));
        return {
          nome: r.nome,
          descricao: r.descricao || null,
          preco: Number(r.preco || 0),
          categoria: CATS.includes(r.categoria) ? r.categoria : "outro",
          quantidade_estoque: Number(r.quantidade_estoque || r.estoque || 0),
          url_foto: r.url_foto || r.foto || null,
        };
      })
      .filter((r) => r.nome);
    const { error } = await supabase.from("produtos").insert(rows);
    if (error) toast.error(error.message);
    else {
      toast.success(`${rows.length} produtos importados`);
      load();
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Catálogo</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Produtos</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {loading ? "Carregando…" : `${items.length} produtos sincronizados`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-md border bg-background p-0.5">
            <Button
              size="sm"
              variant={view === "grid" ? "secondary" : "ghost"}
              onClick={() => setView("grid")}
              className="h-8"
            >
              <LayoutGrid className="size-4" />
            </Button>
            <Button
              size="sm"
              variant={view === "list" ? "secondary" : "ghost"}
              onClick={() => setView("list")}
              className="h-8"
            >
              <ListIcon className="size-4" />
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            hidden
            onChange={(e) => e.target.files?.[0] && importCSV(e.target.files[0])}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4 mr-2" />
            Importar CSV
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4 mr-2" />
            Novo produto
          </Button>
        </div>
      </header>

      <Card className="p-4 flex flex-wrap gap-3 items-center">
        <Input
          placeholder="Buscar produto…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas categorias</SelectItem>
            {CATS.map((c) => (
              <SelectItem key={c} value={c}>
                {CAT_LABEL[c] ?? c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            <SelectItem value="disponivel">Disponível</SelectItem>
            <SelectItem value="esgotado">Esgotado</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} resultado{filtered.length === 1 ? "" : "s"}
        </span>
      </Card>

      {view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {pageItems.map((p) => (
            <Card
              key={p.id}
              className="group overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => {
                setEditing(p);
                setOpen(true);
              }}
            >
              <div className="aspect-square bg-muted relative overflow-hidden">
                {p.url_foto ? (
                  <img
                    src={p.url_foto}
                    alt={p.nome}
                    loading="lazy"
                    className="size-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="size-full grid place-items-center text-muted-foreground">
                    <ImageIcon className="size-8" />
                  </div>
                )}
                {p.status !== "disponivel" && (
                  <Badge
                    variant={p.status === "esgotado" ? "destructive" : "secondary"}
                    className="absolute top-2 left-2 capitalize"
                  >
                    {p.status}
                  </Badge>
                )}
              </div>
              <div className="p-3 space-y-1">
                <p className="text-sm font-medium line-clamp-2 leading-snug min-h-[2.5rem]">
                  {p.nome}
                </p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm font-semibold">
                    R$ {Number(p.preco).toFixed(2)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {p.quantidade_estoque} un
                  </span>
                </div>
              </div>
            </Card>
          ))}
          {!loading && !pageItems.length && (
            <Card className="col-span-full p-12 text-center text-muted-foreground">
              Nenhum produto encontrado.
            </Card>
          )}
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground border-b">
              <tr>
                <th className="p-3 w-16"></th>
                <th className="p-3">Nome</th>
                <th className="p-3">Categoria</th>
                <th className="p-3">Preço</th>
                <th className="p-3">Estoque</th>
                <th className="p-3">Status</th>
                <th className="p-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-accent/30">
                  <td className="p-2">
                    <div className="size-12 rounded bg-muted overflow-hidden">
                      {p.url_foto ? (
                        <img src={p.url_foto} alt={p.nome} loading="lazy" className="size-full object-cover" />
                      ) : (
                        <div className="size-full grid place-items-center text-muted-foreground">
                          <ImageIcon className="size-4" />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-3 font-medium">{p.nome}</td>
                  <td className="p-3">{CAT_LABEL[p.categoria] ?? p.categoria}</td>
                  <td className="p-3">R$ {Number(p.preco).toFixed(2)}</td>
                  <td className="p-3">{p.quantidade_estoque}</td>
                  <td className="p-3">
                    <Badge
                      variant={
                        p.status === "disponivel"
                          ? "default"
                          : p.status === "esgotado"
                            ? "destructive"
                            : "secondary"
                      }
                      className="capitalize"
                    >
                      {p.status}
                    </Badge>
                  </td>
                  <td className="p-3 flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditing(p);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(p.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {!pageItems.length && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-muted-foreground">
                    Nenhum produto.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Próxima
          </Button>
        </div>
      )}

      <ProdutoDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={load} />
    </div>
  );
}

function ProdutoDialog({ open, onOpenChange, editing, onSaved }: any) {
  const [form, setForm] = useState<any>({
    nome: "",
    descricao: "",
    preco: 0,
    categoria: "outro",
    quantidade_estoque: 0,
    url_foto: "",
    status: "disponivel",
  });

  useEffect(() => {
    setForm(
      editing ?? {
        nome: "",
        descricao: "",
        preco: 0,
        categoria: "outro",
        quantidade_estoque: 0,
        url_foto: "",
        status: "disponivel",
      }
    );
  }, [editing, open]);

  const save = async () => {
    if (!form.nome) return toast.error("Nome obrigatório");
    const payload = {
      ...form,
      preco: Number(form.preco),
      quantidade_estoque: Number(form.quantidade_estoque),
    };
    const { error } = editing
      ? await supabase.from("produtos").update(payload).eq("id", editing.id)
      : await supabase.from("produtos").insert(payload);
    if (error) toast.error(error.message);
    else {
      toast.success("Salvo");
      onOpenChange(false);
      onSaved();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
        </DialogHeader>
        <div className="grid md:grid-cols-[180px_1fr] gap-4">
          <div className="space-y-2">
            <div className="aspect-square rounded-md bg-muted overflow-hidden border">
              {form.url_foto ? (
                <img src={form.url_foto} alt="" className="size-full object-cover" />
              ) : (
                <div className="size-full grid place-items-center text-muted-foreground">
                  <ImageIcon className="size-8" />
                </div>
              )}
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={form.descricao ?? ""}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATS.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disponivel">Disponível</SelectItem>
                    <SelectItem value="esgotado">Esgotado</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Preço (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.preco}
                  onChange={(e) => setForm({ ...form, preco: e.target.value })}
                />
              </div>
              <div>
                <Label>Estoque</Label>
                <Input
                  type="number"
                  value={form.quantidade_estoque}
                  onChange={(e) => setForm({ ...form, quantidade_estoque: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>URL da foto</Label>
              <Input value={form.url_foto ?? ""} onChange={(e) => setForm({ ...form, url_foto: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
