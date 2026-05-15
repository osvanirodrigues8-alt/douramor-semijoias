import { supabaseAdmin } from "@/integrations/supabase/client.server";

const API_BASE = "https://api.tiendanube.com/v1";
const USER_AGENT = "Douramor Agente IA (contato@douramor.com.br)";

type NSImage = { src?: string };
type NSVariant = { price?: string | number | null; stock?: number | null };
type NSProduct = {
  id: number | string;
  name?: string | { pt?: string; es?: string; en?: string };
  description?: string | { pt?: string; es?: string; en?: string };
  handle?: string | { pt?: string; es?: string; en?: string };
  permalink?: string;
  canonical_url?: string;
  variants?: NSVariant[];
  images?: NSImage[];
  published?: boolean;
};

function pickLang(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as Record<string, string | undefined>;
    return o.pt ?? o.es ?? o.en ?? Object.values(o)[0] ?? null;
  }
  return null;
}

function stripHtml(s: string | null): string | null {
  if (!s) return null;
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() || null;
}

type Categoria =
  | "anel" | "colar" | "brinco" | "pulseira" | "conjunto"
  | "relogio" | "oculos" | "bracelete" | "escapulario" | "tornozeleira" | "outro";

function inferirCategoria(nome: string): Categoria {
  const n = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/^kit\b/.test(n) || /\bconjunto\b/.test(n)) return "conjunto";
  if (/^relogio/.test(n) || /^relogios/.test(n)) return "relogio";
  if (/^oculos/.test(n)) return "oculos";
  if (/^bracelete/.test(n)) return "bracelete";
  if (/^escapulario/.test(n) || /^escapularios/.test(n)) return "escapulario";
  if (/^tornozeleira/.test(n)) return "tornozeleira";
  if (/^brinco/.test(n)) return "brinco";
  if (/^anel/.test(n) || /^aneis/.test(n)) return "anel";
  if (/^pulseira/.test(n)) return "pulseira";
  if (/^colar/.test(n) || /^gargantilha/.test(n) || /^corrente/.test(n) || /^choker/.test(n) || /^cordao/.test(n))
    return "colar";
  return "outro";
}

export type SyncResult = {
  total: number;
  criados: number;
  atualizados: number;
  erros: number;
  mensagem?: string;
};

export async function syncNuvemshopProducts(): Promise<SyncResult> {
  const { data: conn, error: connErr } = await supabaseAdmin
    .from("nuvemshop_connections")
    .select("store_id, access_token, dominio_loja")
    .order("atualizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (connErr) throw new Error(`Erro ao ler conexão: ${connErr.message}`);
  if (!conn) {
    return { total: 0, criados: 0, atualizados: 0, erros: 0, mensagem: "Nenhuma loja Nuvemshop conectada." };
  }

  const dominio = (conn.dominio_loja ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");

  const headers = {
    Authentication: `bearer ${conn.access_token}`,
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json",
  };

  // IDs existentes para distinguir criados vs atualizados
  const { data: existing } = await supabaseAdmin
    .from("produtos")
    .select("nuvemshop_product_id")
    .not("nuvemshop_product_id", "is", null);
  const existingIds = new Set((existing ?? []).map((r) => r.nuvemshop_product_id as string));

  let page = 1;
  const perPage = 200;
  let total = 0;
  let criados = 0;
  let atualizados = 0;
  let erros = 0;

  while (true) {
    const url = `${API_BASE}/${conn.store_id}/products?per_page=${perPage}&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Nuvemshop ${res.status} na página ${page}: ${body.slice(0, 300)}`);
    }
    const products = (await res.json()) as NSProduct[];
    if (!Array.isArray(products) || products.length === 0) break;

    const rows = products.map((p) => {
      const variants = p.variants ?? [];
      const precoRaw = variants[0]?.price;
      const preco = precoRaw == null ? 0 : Number(precoRaw) || 0;
      const stockSum = variants.reduce<number | null>((acc, v) => {
        if (v.stock == null) return acc; // null = ilimitado
        return (acc ?? 0) + Number(v.stock);
      }, null);
      const quantidade_estoque = stockSum == null ? 9999 : stockSum;
      const url_foto = p.images?.[0]?.src ?? null;
      const nome = pickLang(p.name) ?? `Produto ${p.id}`;
      const descricao = stripHtml(pickLang(p.description));
      const handle = pickLang(p.handle);
      const url_produto =
        p.permalink ??
        p.canonical_url ??
        (handle && dominio ? `https://${dominio}/produtos/${handle}` : null);
      const status: "inativo" | "esgotado" | "disponivel" =
        p.published === false ? "inativo" : quantidade_estoque <= 0 ? "esgotado" : "disponivel";

      return {
        nuvemshop_product_id: String(p.id),
        nome,
        descricao,
        preco,
        quantidade_estoque,
        url_foto,
        url_produto,
        categoria: "outro" as const,
        status,
        sincronizado_em: new Date().toISOString(),
      };
    });

    const { error: upErr } = await supabaseAdmin
      .from("produtos")
      .upsert(rows, { onConflict: "nuvemshop_product_id" });

    if (upErr) {
      console.error("Erro no upsert:", upErr);
      erros += rows.length;
    } else {
      for (const r of rows) {
        if (existingIds.has(r.nuvemshop_product_id)) atualizados++;
        else {
          criados++;
          existingIds.add(r.nuvemshop_product_id);
        }
      }
    }

    total += products.length;
    if (products.length < perPage) break;
    page++;
    if (page > 100) break; // safety
  }

  return { total, criados, atualizados, erros };
}
