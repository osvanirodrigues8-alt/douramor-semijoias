
-- ============ ENUMS ============
CREATE TYPE app_role AS ENUM ('admin', 'atendente');
CREATE TYPE produto_categoria AS ENUM ('anel','colar','brinco','pulseira','conjunto','outro');
CREATE TYPE produto_status AS ENUM ('disponivel','esgotado','inativo');
CREATE TYPE canal AS ENUM ('whatsapp','instagram','site');
CREATE TYPE pedido_status AS ENUM ('novo','confirmado','em_preparo','enviado','entregue','cancelado');
CREATE TYPE pagamento_forma AS ENUM ('pix','link','entrega');
CREATE TYPE entrega_tipo AS ENUM ('retirada','entrega');
CREATE TYPE agendamento_tipo AS ENUM ('visita','retirada');
CREATE TYPE agendamento_status AS ENUM ('pendente','confirmado','cancelado');
CREATE TYPE cupom_tipo AS ENUM ('percentual','valor_fixo');
CREATE TYPE funil_etapa AS ENUM ('menu','catalogo','duvida','pedido','agendamento','cupom','transferencia');

-- ============ PROFILES & ROLES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id);
$$;

-- Auto-create profile on signup; first user becomes admin, rest atendente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE total_users INT;
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email), NEW.email);

  SELECT count(*) INTO total_users FROM public.user_roles;
  IF total_users = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'atendente');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ PRODUTOS ============
CREATE TABLE public.produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  categoria produto_categoria NOT NULL DEFAULT 'outro',
  descricao TEXT,
  preco NUMERIC(10,2) NOT NULL DEFAULT 0,
  url_foto TEXT,
  quantidade_estoque INT NOT NULL DEFAULT 0,
  status produto_status NOT NULL DEFAULT 'disponivel',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto status when stock hits 0
CREATE OR REPLACE FUNCTION public.sync_produto_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'inativo' THEN
    NEW.status := CASE WHEN NEW.quantidade_estoque <= 0 THEN 'esgotado'::produto_status ELSE 'disponivel'::produto_status END;
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER produtos_sync_status BEFORE INSERT OR UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.sync_produto_status();

-- ============ CLIENTES ============
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT,
  contato TEXT NOT NULL,
  canal_origem canal NOT NULL,
  preferencias TEXT,
  ultimo_pedido_id UUID,
  total_pedidos INT NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contato, canal_origem)
);

-- ============ PEDIDOS ============
CREATE TABLE public.pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero SERIAL UNIQUE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  canal canal NOT NULL,
  produtos_ids UUID[] NOT NULL DEFAULT '{}',
  produtos_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  valor_subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  desconto_negociacao NUMERIC(10,2) NOT NULL DEFAULT 0,
  cupom_usado TEXT,
  desconto_cupom NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  forma_pagamento pagamento_forma,
  parcelas INT DEFAULT 1,
  tipo_entrega entrega_tipo,
  endereco_entrega TEXT,
  status pedido_status NOT NULL DEFAULT 'novo',
  motivo_cancelamento TEXT,
  visualizado BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.touch_pedido()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER pedidos_touch BEFORE UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.touch_pedido();

-- ============ AGENDAMENTOS ============
CREATE TABLE public.agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  canal canal NOT NULL,
  data_hora TIMESTAMPTZ NOT NULL,
  tipo agendamento_tipo NOT NULL,
  observacao TEXT,
  status agendamento_status NOT NULL DEFAULT 'pendente',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ CUPONS ============
CREATE TABLE public.cupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  tipo_desconto cupom_tipo NOT NULL,
  valor_desconto NUMERIC(10,2) NOT NULL,
  validade DATE,
  limite_usos INT,
  usos_realizados INT NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ FOLLOW UPS ============
CREATE TABLE public.follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  canal canal NOT NULL,
  pedido_id UUID REFERENCES public.pedidos(id) ON DELETE CASCADE,
  mensagem TEXT NOT NULL,
  agendado_para TIMESTAMPTZ NOT NULL,
  enviado BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ AVALIACOES ============
CREATE TABLE public.avaliacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  pedido_id UUID REFERENCES public.pedidos(id) ON DELETE SET NULL,
  nota INT NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario TEXT,
  canal canal NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ FUNIL CONVERSAS ============
CREATE TABLE public.funil_conversas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  canal canal NOT NULL,
  etapa_iniciada funil_etapa NOT NULL,
  etapa_abandonada funil_etapa,
  converteu BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ VISUALIZACOES PRODUTOS ============
CREATE TABLE public.visualizacoes_produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID REFERENCES public.produtos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  canal canal NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ CONVERSAS E MENSAGENS (widget) ============
CREATE TABLE public.conversas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  canal canal NOT NULL,
  sessao_token TEXT NOT NULL UNIQUE,
  contexto JSONB DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
  papel TEXT NOT NULL CHECK (papel IN ('user','assistant','system')),
  conteudo TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ CONFIGURACOES (singleton) ============
CREATE TABLE public.configuracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_loja TEXT NOT NULL DEFAULT 'JoiaBot',
  descricao_loja TEXT,
  diferenciais_loja TEXT,
  nome_agente TEXT NOT NULL DEFAULT 'Joia',
  tom_padrao TEXT NOT NULL DEFAULT 'semiformal',
  mensagem_boas_vindas TEXT NOT NULL DEFAULT 'Olá! Bem-vinda à nossa loja 💛 Como posso ajudar?',
  horario_atendimento_inicio TIME NOT NULL DEFAULT '09:00',
  horario_atendimento_fim TIME NOT NULL DEFAULT '18:00',
  whatsapp_humano TEXT,
  token_whatsapp_api TEXT,
  url_whatsapp_api TEXT,
  token_instagram TEXT,
  formas_pagamento_ativas TEXT[] NOT NULL DEFAULT ARRAY['pix','link','entrega'],
  parcelamento_ativo BOOLEAN NOT NULL DEFAULT TRUE,
  valor_minimo_parcelamento NUMERIC(10,2) NOT NULL DEFAULT 200,
  max_parcelas INT NOT NULL DEFAULT 6,
  taxa_entrega NUMERIC(10,2) NOT NULL DEFAULT 0,
  area_cobertura_entrega TEXT,
  enviar_foto_catalogo BOOLEAN NOT NULL DEFAULT TRUE,
  limite_desconto_negociacao NUMERIC(5,2) NOT NULL DEFAULT 10,
  follow_up_ativo BOOLEAN NOT NULL DEFAULT TRUE,
  follow_up_horas INT NOT NULL DEFAULT 24,
  follow_up_mensagem TEXT NOT NULL DEFAULT 'Oi! Notamos que você começou um pedido conosco mas não finalizou. Posso te ajudar?',
  modelo_ia TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.configuracoes (id) VALUES (gen_random_uuid());

-- ============ RLS ============
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avaliacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funil_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visualizacoes_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;

-- Profiles: user sees own, staff sees all
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id OR public.is_staff(auth.uid()));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- User_roles: only admins manage; users can read own
CREATE POLICY "View own roles or admin" ON public.user_roles FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Staff-readable tables
CREATE POLICY "Staff reads produtos" ON public.produtos FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins manage produtos" ON public.produtos FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Staff reads clientes" ON public.clientes FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins manage clientes" ON public.clientes FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Staff reads pedidos" ON public.pedidos FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff updates pedidos" ON public.pedidos FOR UPDATE USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins manage pedidos" ON public.pedidos FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Staff reads agendamentos" ON public.agendamentos FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff updates agendamentos" ON public.agendamentos FOR UPDATE USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins manage agendamentos" ON public.agendamentos FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins manage cupons" ON public.cupons FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Staff reads cupons" ON public.cupons FOR SELECT USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff reads follow_ups" ON public.follow_ups FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins manage follow_ups" ON public.follow_ups FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Staff reads avaliacoes" ON public.avaliacoes FOR SELECT USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff reads funil" ON public.funil_conversas FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff reads viz" ON public.visualizacoes_produtos FOR SELECT USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff reads configuracoes" ON public.configuracoes FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins update configuracoes" ON public.configuracoes FOR UPDATE USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Staff reads conversas" ON public.conversas FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff reads mensagens" ON public.mensagens FOR SELECT USING (public.is_staff(auth.uid()));
