export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agendamentos: {
        Row: {
          canal: Database["public"]["Enums"]["canal"]
          cliente_id: string | null
          criado_em: string
          data_hora: string
          id: string
          observacao: string | null
          status: Database["public"]["Enums"]["agendamento_status"]
          tipo: Database["public"]["Enums"]["agendamento_tipo"]
        }
        Insert: {
          canal: Database["public"]["Enums"]["canal"]
          cliente_id?: string | null
          criado_em?: string
          data_hora: string
          id?: string
          observacao?: string | null
          status?: Database["public"]["Enums"]["agendamento_status"]
          tipo: Database["public"]["Enums"]["agendamento_tipo"]
        }
        Update: {
          canal?: Database["public"]["Enums"]["canal"]
          cliente_id?: string | null
          criado_em?: string
          data_hora?: string
          id?: string
          observacao?: string | null
          status?: Database["public"]["Enums"]["agendamento_status"]
          tipo?: Database["public"]["Enums"]["agendamento_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      avaliacoes: {
        Row: {
          canal: Database["public"]["Enums"]["canal"]
          cliente_id: string | null
          comentario: string | null
          criado_em: string
          id: string
          nota: number
          pedido_id: string | null
        }
        Insert: {
          canal: Database["public"]["Enums"]["canal"]
          cliente_id?: string | null
          comentario?: string | null
          criado_em?: string
          id?: string
          nota: number
          pedido_id?: string | null
        }
        Update: {
          canal?: Database["public"]["Enums"]["canal"]
          cliente_id?: string | null
          comentario?: string | null
          criado_em?: string
          id?: string
          nota?: number
          pedido_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avaliacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliacoes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          atualizado_em: string
          canal_origem: Database["public"]["Enums"]["canal"]
          contato: string
          criado_em: string
          id: string
          nome: string | null
          preferencias: string | null
          total_pedidos: number
          ultimo_pedido_id: string | null
        }
        Insert: {
          atualizado_em?: string
          canal_origem: Database["public"]["Enums"]["canal"]
          contato: string
          criado_em?: string
          id?: string
          nome?: string | null
          preferencias?: string | null
          total_pedidos?: number
          ultimo_pedido_id?: string | null
        }
        Update: {
          atualizado_em?: string
          canal_origem?: Database["public"]["Enums"]["canal"]
          contato?: string
          criado_em?: string
          id?: string
          nome?: string | null
          preferencias?: string | null
          total_pedidos?: number
          ultimo_pedido_id?: string | null
        }
        Relationships: []
      }
      configuracoes: {
        Row: {
          area_cobertura_entrega: string | null
          assinatura: string | null
          atualizado_em: string
          descricao_loja: string | null
          diferenciais_loja: string | null
          enviar_foto_catalogo: boolean
          follow_up_ativo: boolean
          follow_up_horas: number
          follow_up_mensagem: string
          formas_pagamento_ativas: string[]
          horario_atendimento_fim: string
          horario_atendimento_inicio: string
          id: string
          idioma: string
          limite_desconto_negociacao: number
          max_parcelas: number
          mensagem_boas_vindas: string
          mensagem_fora_horario: string | null
          modelo_ia: string
          nome_agente: string
          nome_loja: string
          palavras_proibidas: string | null
          parcelamento_ativo: boolean
          personalidade: string | null
          politica_desconto: string | null
          quando_transferir_humano: string | null
          regras_extras: string | null
          responder_fora_horario: boolean
          saudacao_site: string | null
          saudacao_whatsapp: string | null
          tamanho_resposta: string
          taxa_entrega: number
          token_instagram: string | null
          token_whatsapp_api: string | null
          tom_padrao: string
          topicos_proibidos: string | null
          url_whatsapp_api: string | null
          uso_emoji: string
          valor_minimo_parcelamento: number
          whatsapp_humano: string | null
        }
        Insert: {
          area_cobertura_entrega?: string | null
          assinatura?: string | null
          atualizado_em?: string
          descricao_loja?: string | null
          diferenciais_loja?: string | null
          enviar_foto_catalogo?: boolean
          follow_up_ativo?: boolean
          follow_up_horas?: number
          follow_up_mensagem?: string
          formas_pagamento_ativas?: string[]
          horario_atendimento_fim?: string
          horario_atendimento_inicio?: string
          id?: string
          idioma?: string
          limite_desconto_negociacao?: number
          max_parcelas?: number
          mensagem_boas_vindas?: string
          mensagem_fora_horario?: string | null
          modelo_ia?: string
          nome_agente?: string
          nome_loja?: string
          palavras_proibidas?: string | null
          parcelamento_ativo?: boolean
          personalidade?: string | null
          politica_desconto?: string | null
          quando_transferir_humano?: string | null
          regras_extras?: string | null
          responder_fora_horario?: boolean
          saudacao_site?: string | null
          saudacao_whatsapp?: string | null
          tamanho_resposta?: string
          taxa_entrega?: number
          token_instagram?: string | null
          token_whatsapp_api?: string | null
          tom_padrao?: string
          topicos_proibidos?: string | null
          url_whatsapp_api?: string | null
          uso_emoji?: string
          valor_minimo_parcelamento?: number
          whatsapp_humano?: string | null
        }
        Update: {
          area_cobertura_entrega?: string | null
          assinatura?: string | null
          atualizado_em?: string
          descricao_loja?: string | null
          diferenciais_loja?: string | null
          enviar_foto_catalogo?: boolean
          follow_up_ativo?: boolean
          follow_up_horas?: number
          follow_up_mensagem?: string
          formas_pagamento_ativas?: string[]
          horario_atendimento_fim?: string
          horario_atendimento_inicio?: string
          id?: string
          idioma?: string
          limite_desconto_negociacao?: number
          max_parcelas?: number
          mensagem_boas_vindas?: string
          mensagem_fora_horario?: string | null
          modelo_ia?: string
          nome_agente?: string
          nome_loja?: string
          palavras_proibidas?: string | null
          parcelamento_ativo?: boolean
          personalidade?: string | null
          politica_desconto?: string | null
          quando_transferir_humano?: string | null
          regras_extras?: string | null
          responder_fora_horario?: boolean
          saudacao_site?: string | null
          saudacao_whatsapp?: string | null
          tamanho_resposta?: string
          taxa_entrega?: number
          token_instagram?: string | null
          token_whatsapp_api?: string | null
          tom_padrao?: string
          topicos_proibidos?: string | null
          url_whatsapp_api?: string | null
          uso_emoji?: string
          valor_minimo_parcelamento?: number
          whatsapp_humano?: string | null
        }
        Relationships: []
      }
      conversas: {
        Row: {
          atualizado_em: string
          canal: Database["public"]["Enums"]["canal"]
          cliente_id: string | null
          contexto: Json | null
          criado_em: string
          id: string
          sessao_token: string
        }
        Insert: {
          atualizado_em?: string
          canal: Database["public"]["Enums"]["canal"]
          cliente_id?: string | null
          contexto?: Json | null
          criado_em?: string
          id?: string
          sessao_token: string
        }
        Update: {
          atualizado_em?: string
          canal?: Database["public"]["Enums"]["canal"]
          cliente_id?: string | null
          contexto?: Json | null
          criado_em?: string
          id?: string
          sessao_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      cupons: {
        Row: {
          ativo: boolean
          codigo: string
          criado_em: string
          id: string
          limite_usos: number | null
          tipo_desconto: Database["public"]["Enums"]["cupom_tipo"]
          usos_realizados: number
          validade: string | null
          valor_desconto: number
        }
        Insert: {
          ativo?: boolean
          codigo: string
          criado_em?: string
          id?: string
          limite_usos?: number | null
          tipo_desconto: Database["public"]["Enums"]["cupom_tipo"]
          usos_realizados?: number
          validade?: string | null
          valor_desconto: number
        }
        Update: {
          ativo?: boolean
          codigo?: string
          criado_em?: string
          id?: string
          limite_usos?: number | null
          tipo_desconto?: Database["public"]["Enums"]["cupom_tipo"]
          usos_realizados?: number
          validade?: string | null
          valor_desconto?: number
        }
        Relationships: []
      }
      faqs: {
        Row: {
          ativo: boolean
          atualizado_em: string
          categoria: string | null
          criado_em: string
          id: string
          ordem: number
          pergunta: string
          resposta: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          categoria?: string | null
          criado_em?: string
          id?: string
          ordem?: number
          pergunta: string
          resposta: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          categoria?: string | null
          criado_em?: string
          id?: string
          ordem?: number
          pergunta?: string
          resposta?: string
        }
        Relationships: []
      }
      follow_ups: {
        Row: {
          agendado_para: string
          canal: Database["public"]["Enums"]["canal"]
          cliente_id: string | null
          criado_em: string
          enviado: boolean
          id: string
          mensagem: string
          pedido_id: string | null
        }
        Insert: {
          agendado_para: string
          canal: Database["public"]["Enums"]["canal"]
          cliente_id?: string | null
          criado_em?: string
          enviado?: boolean
          id?: string
          mensagem: string
          pedido_id?: string | null
        }
        Update: {
          agendado_para?: string
          canal?: Database["public"]["Enums"]["canal"]
          cliente_id?: string | null
          criado_em?: string
          enviado?: boolean
          id?: string
          mensagem?: string
          pedido_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      funil_conversas: {
        Row: {
          canal: Database["public"]["Enums"]["canal"]
          cliente_id: string | null
          converteu: boolean
          criado_em: string
          etapa_abandonada: Database["public"]["Enums"]["funil_etapa"] | null
          etapa_iniciada: Database["public"]["Enums"]["funil_etapa"]
          id: string
        }
        Insert: {
          canal: Database["public"]["Enums"]["canal"]
          cliente_id?: string | null
          converteu?: boolean
          criado_em?: string
          etapa_abandonada?: Database["public"]["Enums"]["funil_etapa"] | null
          etapa_iniciada: Database["public"]["Enums"]["funil_etapa"]
          id?: string
        }
        Update: {
          canal?: Database["public"]["Enums"]["canal"]
          cliente_id?: string | null
          converteu?: boolean
          criado_em?: string
          etapa_abandonada?: Database["public"]["Enums"]["funil_etapa"] | null
          etapa_iniciada?: Database["public"]["Enums"]["funil_etapa"]
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funil_conversas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens: {
        Row: {
          conteudo: string
          conversa_id: string
          criado_em: string
          id: string
          papel: string
        }
        Insert: {
          conteudo: string
          conversa_id: string
          criado_em?: string
          id?: string
          papel: string
        }
        Update: {
          conteudo?: string
          conversa_id?: string
          criado_em?: string
          id?: string
          papel?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          atualizado_em: string
          canal: Database["public"]["Enums"]["canal"]
          cliente_id: string | null
          criado_em: string
          cupom_usado: string | null
          desconto_cupom: number
          desconto_negociacao: number
          endereco_entrega: string | null
          forma_pagamento: Database["public"]["Enums"]["pagamento_forma"] | null
          id: string
          motivo_cancelamento: string | null
          numero: number
          parcelas: number | null
          produtos_ids: string[]
          produtos_snapshot: Json
          status: Database["public"]["Enums"]["pedido_status"]
          tipo_entrega: Database["public"]["Enums"]["entrega_tipo"] | null
          valor_subtotal: number
          valor_total: number
          visualizado: boolean
        }
        Insert: {
          atualizado_em?: string
          canal: Database["public"]["Enums"]["canal"]
          cliente_id?: string | null
          criado_em?: string
          cupom_usado?: string | null
          desconto_cupom?: number
          desconto_negociacao?: number
          endereco_entrega?: string | null
          forma_pagamento?:
            | Database["public"]["Enums"]["pagamento_forma"]
            | null
          id?: string
          motivo_cancelamento?: string | null
          numero?: number
          parcelas?: number | null
          produtos_ids?: string[]
          produtos_snapshot?: Json
          status?: Database["public"]["Enums"]["pedido_status"]
          tipo_entrega?: Database["public"]["Enums"]["entrega_tipo"] | null
          valor_subtotal?: number
          valor_total?: number
          visualizado?: boolean
        }
        Update: {
          atualizado_em?: string
          canal?: Database["public"]["Enums"]["canal"]
          cliente_id?: string | null
          criado_em?: string
          cupom_usado?: string | null
          desconto_cupom?: number
          desconto_negociacao?: number
          endereco_entrega?: string | null
          forma_pagamento?:
            | Database["public"]["Enums"]["pagamento_forma"]
            | null
          id?: string
          motivo_cancelamento?: string | null
          numero?: number
          parcelas?: number | null
          produtos_ids?: string[]
          produtos_snapshot?: Json
          status?: Database["public"]["Enums"]["pedido_status"]
          tipo_entrega?: Database["public"]["Enums"]["entrega_tipo"] | null
          valor_subtotal?: number
          valor_total?: number
          visualizado?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          atualizado_em: string
          categoria: Database["public"]["Enums"]["produto_categoria"]
          criado_em: string
          descricao: string | null
          id: string
          nome: string
          preco: number
          quantidade_estoque: number
          status: Database["public"]["Enums"]["produto_status"]
          url_foto: string | null
        }
        Insert: {
          atualizado_em?: string
          categoria?: Database["public"]["Enums"]["produto_categoria"]
          criado_em?: string
          descricao?: string | null
          id?: string
          nome: string
          preco?: number
          quantidade_estoque?: number
          status?: Database["public"]["Enums"]["produto_status"]
          url_foto?: string | null
        }
        Update: {
          atualizado_em?: string
          categoria?: Database["public"]["Enums"]["produto_categoria"]
          criado_em?: string
          descricao?: string | null
          id?: string
          nome?: string
          preco?: number
          quantidade_estoque?: number
          status?: Database["public"]["Enums"]["produto_status"]
          url_foto?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          criado_em: string
          email: string
          id: string
          nome: string
        }
        Insert: {
          criado_em?: string
          email: string
          id: string
          nome: string
        }
        Update: {
          criado_em?: string
          email?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          criado_em: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          criado_em?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          criado_em?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visualizacoes_produtos: {
        Row: {
          canal: Database["public"]["Enums"]["canal"]
          cliente_id: string | null
          criado_em: string
          id: string
          produto_id: string | null
        }
        Insert: {
          canal: Database["public"]["Enums"]["canal"]
          cliente_id?: string | null
          criado_em?: string
          id?: string
          produto_id?: string | null
        }
        Update: {
          canal?: Database["public"]["Enums"]["canal"]
          cliente_id?: string | null
          criado_em?: string
          id?: string
          produto_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visualizacoes_produtos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visualizacoes_produtos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      agendamento_status: "pendente" | "confirmado" | "cancelado"
      agendamento_tipo: "visita" | "retirada"
      app_role: "admin" | "atendente"
      canal: "whatsapp" | "instagram" | "site"
      cupom_tipo: "percentual" | "valor_fixo"
      entrega_tipo: "retirada" | "entrega"
      funil_etapa:
        | "menu"
        | "catalogo"
        | "duvida"
        | "pedido"
        | "agendamento"
        | "cupom"
        | "transferencia"
      pagamento_forma: "pix" | "link" | "entrega"
      pedido_status:
        | "novo"
        | "confirmado"
        | "em_preparo"
        | "enviado"
        | "entregue"
        | "cancelado"
      produto_categoria:
        | "anel"
        | "colar"
        | "brinco"
        | "pulseira"
        | "conjunto"
        | "outro"
      produto_status: "disponivel" | "esgotado" | "inativo"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agendamento_status: ["pendente", "confirmado", "cancelado"],
      agendamento_tipo: ["visita", "retirada"],
      app_role: ["admin", "atendente"],
      canal: ["whatsapp", "instagram", "site"],
      cupom_tipo: ["percentual", "valor_fixo"],
      entrega_tipo: ["retirada", "entrega"],
      funil_etapa: [
        "menu",
        "catalogo",
        "duvida",
        "pedido",
        "agendamento",
        "cupom",
        "transferencia",
      ],
      pagamento_forma: ["pix", "link", "entrega"],
      pedido_status: [
        "novo",
        "confirmado",
        "em_preparo",
        "enviado",
        "entregue",
        "cancelado",
      ],
      produto_categoria: [
        "anel",
        "colar",
        "brinco",
        "pulseira",
        "conjunto",
        "outro",
      ],
      produto_status: ["disponivel", "esgotado", "inativo"],
    },
  },
} as const
