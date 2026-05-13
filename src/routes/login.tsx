import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { signIn, signUp, session, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [session, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = mode === "login"
      ? await signIn(email, password)
      : await signUp(email, password, nome);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
    } else if (mode === "signup") {
      toast.success("Conta criada! Você já pode entrar.");
      setMode("login");
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-brand/10 via-background to-background border-r">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-sm bg-brand ring-1 ring-brand/20" />
          <span className="font-semibold tracking-tight">Douramor Semi Joias</span>
        </div>
        <div className="space-y-4 max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            Atendimento automatizado para sua loja de semi joias.
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Centralize WhatsApp, Instagram e seu site num só painel. Sua agente virtual responde, vende e agenda — você acompanha tudo aqui.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Douramor Semi Joias</p>
      </div>

      <div className="flex items-center justify-center p-8">
        <Card className="w-full max-w-sm p-8 space-y-6">
          <div>
            <h2 className="text-xl font-semibold">{mode === "login" ? "Entrar no painel" : "Criar conta"}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {mode === "login" ? "Acesse seu painel Douramor Semi Joias" : "A primeira conta criada será a de administrador"}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="nome">Nome</Label>
                <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
          >
            {mode === "login" ? "Não tem conta? Criar uma" : "Já tem conta? Entrar"}
          </button>
        </Card>
      </div>
    </div>
  );
}
