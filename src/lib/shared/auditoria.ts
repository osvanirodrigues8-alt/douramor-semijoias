import { SupabaseClient } from "@supabase/supabase-js";

type MsgHist = { id?: string; papel: string; conteudo: string; criado_em?: string };

interface DetectarParams {
  supabase: SupabaseClient<any>;
  conversaId: string;
  hist: MsgHist[];
  textoUsuario: string;
  respostaIA: string;
  mensagemId?: string | null;
  marcarHumano?: boolean;
}

function normalizarTexto(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function eSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length > 10 && b.length > 10 && (a.includes(b) || b.includes(a))) return true;
  const palavras = (s: string) => s.split(" ").filter((w) => w.length > 3);
  const pa = new Set(palavras(a));
  const pb = palavras(b);
  const inter = pb.filter((w) => pa.has(w)).length;
  const uniao = new Set([...pa, ...pb]).size;
  return uniao > 0 && inter / uniao >= 0.5;
}

function snapshotHist(hist: MsgHist[], textoAtual?: string): object {
  const msgs = hist.slice(-6).map((m) => ({
    papel: m.papel,
    conteudo: m.conteudo.slice(0, 300),
    criado_em: m.criado_em,
  }));
  if (textoAtual) msgs.push({ papel: "user", conteudo: textoAtual.slice(0, 300) } as any);
  return { mensagens: msgs, total_historico: hist.length };
}

export async function registrarFeedback(
  supabase: SupabaseClient<any>,
  dados: {
    conversaId: string;
    mensagemId?: string | null;
    tipo: string;
    severidade: string;
    descricao: string;
    contexto?: object;
    sugestao?: string | null;
    notaIa?: number | null;
    status?: string;
  }
) {
  const { error } = await supabase.from("feedback_ia").insert({
    conversa_id: dados.conversaId,
    mensagem_id: dados.mensagemId ?? null,
    tipo: dados.tipo,
    severidade: dados.severidade,
    descricao: dados.descricao,
    contexto_conversa: dados.contexto ?? null,
    sugestao_correcao: dados.sugestao ?? null,
    status: dados.status ?? "pendente",
    nota_ia: dados.notaIa ?? null,
  });
  if (error) console.error("[feedback_ia] insert error:", error.message);
}

export async function detectarProblemasConversa(params: DetectarParams) {
  const { supabase, conversaId, hist, textoUsuario, mensagemId, marcarHumano } = params;
  const ctx = snapshotHist(hist, textoUsuario);

  // 1. Escalonamento rápido (< 3 trocas = 6 mensagens no histórico)
  if (marcarHumano && hist.length < 6) {
    await registrarFeedback(supabase, {
      conversaId,
      mensagemId,
      tipo: "auto_escalonamento_rapido",
      severidade: "alta",
      descricao: `Conversa escalou para humano com apenas ${hist.length} mensagens no histórico`,
      contexto: ctx,
    });
  }

  // 2. Negação após resposta da IA
  const penultimaEhAssistant =
    hist.length >= 1 && hist[hist.length - 1]?.papel === "assistant";
  if (penultimaEhAssistant) {
    const regexNegacao =
      /\b(n[aã]o\s+era\s+(isso|bem|certo|o\s+que)|errado|n[aã]o\s+entendeu?|n[aã]o\s+foi\s+(isso|bem)|errou|outra\s+coisa|diferente|confundiu|n[aã]o\s+[eé]\s+isso|me\s+enganei?\s+n[aã]o)\b/i;
    if (regexNegacao.test(textoUsuario)) {
      await registrarFeedback(supabase, {
        conversaId,
        mensagemId,
        tipo: "auto_negacao",
        severidade: "media",
        descricao: `Cliente sinalizou que IA não entendeu: "${textoUsuario.slice(0, 120)}"`,
        contexto: ctx,
      });
    }
  }

  // 3. Repetição de pergunta
  const textoNorm = normalizarTexto(textoUsuario);
  if (textoNorm.length >= 10) {
    const msgsUsuario = hist.filter((m) => m.papel === "user");
    for (const m of msgsUsuario) {
      const mNorm = normalizarTexto(m.conteudo);
      if (mNorm.length >= 10 && eSimilar(textoNorm, mNorm)) {
        await registrarFeedback(supabase, {
          conversaId,
          mensagemId,
          tipo: "auto_repeticao",
          severidade: "media",
          descricao: `Cliente repetiu a pergunta: "${textoUsuario.slice(0, 120)}"`,
          contexto: ctx,
        });
        break;
      }
    }
  }
}
