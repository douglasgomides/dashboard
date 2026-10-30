// Gerado pelo Supabase (generate_typescript_types) e ajustado por scripts/tipos-supabase.mjs. Não edite à mão.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Tipos de domínio usados pelo Hub (valores aceitos nas colunas de texto; o banco usa check, não enum).
export type FunnelStage = "C0" | "C1" | "C2" | "C3";
export type MethodologyStage = "percepcao" | "confianca" | "venda" | "multiplicacao";
export type ContentFormat = "reels" | "carrossel" | "estatico" | "stories";
export type SuggestionStatus = "suggested" | "accepted" | "dismissed";
export type CfmScoreStatus = "verde" | "amarelo" | "vermelho";
export type ClientMemberRole = "owner" | "strategist" | "viewer";
export type CrmProvider = "kommo" | "feegow" | "ninsaude" | "clint" | "rdstation" | "flwchat" | "digisac";

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      _flw_stage: {
        Row: {
          card: Json | null
          card_id: string
          contact: Json | null
          contact_done: boolean | null
        }
        Insert: {
          card?: Json | null
          card_id: string
          contact?: Json | null
          contact_done?: boolean | null
        }
        Update: {
          card?: Json | null
          card_id?: string
          contact?: Json | null
          contact_done?: boolean | null
        }
        Relationships: []
      }
      _flw_steps: {
        Row: {
          id: string
          phase: string | null
          title: string | null
        }
        Insert: {
          id: string
          phase?: string | null
          title?: string | null
        }
        Update: {
          id?: string
          phase?: string | null
          title?: string | null
        }
        Relationships: []
      }
      acessos_conversas: {
        Row: {
          acao: string
          client_id: string | null
          conversa_id: string | null
          em: string
          id: number
          user_id: string | null
        }
        Insert: {
          acao: string
          client_id?: string | null
          conversa_id?: string | null
          em?: string
          id?: number
          user_id?: string | null
        }
        Update: {
          acao?: string
          client_id?: string | null
          conversa_id?: string | null
          em?: string
          id?: number
          user_id?: string | null
        }
        Relationships: []
      }
      acoes_acompanhamento: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          checklist: Json
          client_id: string
          criado_em: string
          feedback: string | null
          historico: Json
          insight_id: string
          prazo: string | null
          responsavel: string
          resultado: Json | null
          status: string
          titulo: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          checklist?: Json
          client_id: string
          criado_em?: string
          feedback?: string | null
          historico?: Json
          insight_id: string
          prazo?: string | null
          responsavel: string
          resultado?: Json | null
          status: string
          titulo: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          checklist?: Json
          client_id?: string
          criado_em?: string
          feedback?: string | null
          historico?: Json
          insight_id?: string
          prazo?: string | null
          responsavel?: string
          resultado?: Json | null
          status?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "acoes_acompanhamento_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_planilha_semanal: {
        Row: {
          acao: string | null
          analise_em: string
          atualizado_em: string
          client_id: string
          custo_mensagem: number | null
          custo_seguidor: number | null
          id: string
          mensagens_antes: number | null
          mensagens_depois: number | null
          mensagens_periodo: number | null
          nome: string | null
          orcamento_dia: number | null
          post_url: string
          seguidores_antes: number | null
          seguidores_apos: number | null
          seguidores_periodo: number | null
          status: string | null
          tipo: string | null
          valor_periodo: number | null
          valor_total: number | null
        }
        Insert: {
          acao?: string | null
          analise_em: string
          atualizado_em?: string
          client_id: string
          custo_mensagem?: number | null
          custo_seguidor?: number | null
          id?: string
          mensagens_antes?: number | null
          mensagens_depois?: number | null
          mensagens_periodo?: number | null
          nome?: string | null
          orcamento_dia?: number | null
          post_url: string
          seguidores_antes?: number | null
          seguidores_apos?: number | null
          seguidores_periodo?: number | null
          status?: string | null
          tipo?: string | null
          valor_periodo?: number | null
          valor_total?: number | null
        }
        Update: {
          acao?: string | null
          analise_em?: string
          atualizado_em?: string
          client_id?: string
          custo_mensagem?: number | null
          custo_seguidor?: number | null
          id?: string
          mensagens_antes?: number | null
          mensagens_depois?: number | null
          mensagens_periodo?: number | null
          nome?: string | null
          orcamento_dia?: number | null
          post_url?: string
          seguidores_antes?: number | null
          seguidores_apos?: number | null
          seguidores_periodo?: number | null
          status?: string | null
          tipo?: string | null
          valor_periodo?: number | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_planilha_semanal_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      agente_execucoes: {
        Row: {
          agente: string
          atualizado_em: string
          client_id: string
          contexto: Json
          criado_em: string
          criado_por: string | null
          custo_usd: number
          encerrado_em: string | null
          erro: string | null
          estado: string
          estado_antes_pausa: string | null
          fluxo: string
          id: string
          lease_ate: string | null
          objetivo: string
          passo_atual: number
          proximo_em: string | null
          resultado: Json | null
          tentativas: number
          teto_custo_usd: number
        }
        Insert: {
          agente: string
          atualizado_em?: string
          client_id: string
          contexto?: Json
          criado_em?: string
          criado_por?: string | null
          custo_usd?: number
          encerrado_em?: string | null
          erro?: string | null
          estado?: string
          estado_antes_pausa?: string | null
          fluxo: string
          id?: string
          lease_ate?: string | null
          objetivo: string
          passo_atual?: number
          proximo_em?: string | null
          resultado?: Json | null
          tentativas?: number
          teto_custo_usd?: number
        }
        Update: {
          agente?: string
          atualizado_em?: string
          client_id?: string
          contexto?: Json
          criado_em?: string
          criado_por?: string | null
          custo_usd?: number
          encerrado_em?: string | null
          erro?: string | null
          estado?: string
          estado_antes_pausa?: string | null
          fluxo?: string
          id?: string
          lease_ate?: string | null
          objetivo?: string
          passo_atual?: number
          proximo_em?: string | null
          resultado?: Json | null
          tentativas?: number
          teto_custo_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "agente_execucoes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      agente_passos: {
        Row: {
          chave_idempotencia: string | null
          criado_em: string
          custo_usd: number
          entrada: Json | null
          erro: string | null
          execucao_id: string
          ferramenta: string | null
          id: number
          ms: number | null
          nome: string
          ok: boolean | null
          ordem: number
          risco: string | null
          saida: Json | null
        }
        Insert: {
          chave_idempotencia?: string | null
          criado_em?: string
          custo_usd?: number
          entrada?: Json | null
          erro?: string | null
          execucao_id: string
          ferramenta?: string | null
          id?: number
          ms?: number | null
          nome: string
          ok?: boolean | null
          ordem: number
          risco?: string | null
          saida?: Json | null
        }
        Update: {
          chave_idempotencia?: string | null
          criado_em?: string
          custo_usd?: number
          entrada?: Json | null
          erro?: string | null
          execucao_id?: string
          ferramenta?: string | null
          id?: number
          ms?: number | null
          nome?: string
          ok?: boolean | null
          ordem?: number
          risco?: string | null
          saida?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agente_passos_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "agente_execucoes"
            referencedColumns: ["id"]
          },
        ]
      }
      anuncios_acoes: {
        Row: {
          campaign_id: string
          client_id: string
          de: string | null
          em: string
          erro: string | null
          id: number
          ok: boolean
          para: string
          por: string | null
        }
        Insert: {
          campaign_id: string
          client_id: string
          de?: string | null
          em?: string
          erro?: string | null
          id?: number
          ok: boolean
          para: string
          por?: string | null
        }
        Update: {
          campaign_id?: string
          client_id?: string
          de?: string | null
          em?: string
          erro?: string | null
          id?: number
          ok?: boolean
          para?: string
          por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anuncios_acoes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      app_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      aprovacoes: {
        Row: {
          client_id: string
          comentario: string | null
          criado_em: string
          decidido_em: string | null
          decidido_por: string | null
          estado: string
          evidencias: Json
          execucao_id: string
          id: string
          passo: string
          proposta: Json
          resumo: string
          risco: string
        }
        Insert: {
          client_id: string
          comentario?: string | null
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          estado?: string
          evidencias?: Json
          execucao_id: string
          id?: string
          passo: string
          proposta?: Json
          resumo: string
          risco: string
        }
        Update: {
          client_id?: string
          comentario?: string | null
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          estado?: string
          evidencias?: Json
          execucao_id?: string
          id?: string
          passo?: string
          proposta?: Json
          resumo?: string
          risco?: string
        }
        Relationships: [
          {
            foreignKeyName: "aprovacoes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aprovacoes_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "agente_execucoes"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_itens: {
        Row: {
          chave: string
          client_id: string
          comentario: string | null
          confianca: string
          criado_em: string
          criado_por: string | null
          decidido_em: string | null
          decidido_por: string | null
          estado: string
          execucao_id: string | null
          fonte: string
          fonte_detalhe: string | null
          id: string
          memoria: string
          origem: string
          valor: string
        }
        Insert: {
          chave: string
          client_id: string
          comentario?: string | null
          confianca?: string
          criado_em?: string
          criado_por?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          estado?: string
          execucao_id?: string | null
          fonte: string
          fonte_detalhe?: string | null
          id?: string
          memoria: string
          origem?: string
          valor: string
        }
        Update: {
          chave?: string
          client_id?: string
          comentario?: string | null
          confianca?: string
          criado_em?: string
          criado_por?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          estado?: string
          execucao_id?: string | null
          fonte?: string
          fonte_detalhe?: string | null
          id?: string
          memoria?: string
          origem?: string
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_itens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_itens_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "agente_execucoes"
            referencedColumns: ["id"]
          },
        ]
      }
      campanhas_ideias: {
        Row: {
          brain: Json
          canal: string
          client_id: string
          criado_em: string
          decidido_em: string | null
          decidido_por: string | null
          esforco: string
          estado: string
          evidencias: Json
          execucao_id: string | null
          id: string
          mensagem: string | null
          metrica: string
          oferta: string | null
          passos: Json
          porque: string
          prazo_dias: number
          publico: string
          resultado: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          brain?: Json
          canal: string
          client_id: string
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          esforco?: string
          estado?: string
          evidencias?: Json
          execucao_id?: string | null
          id?: string
          mensagem?: string | null
          metrica: string
          oferta?: string | null
          passos?: Json
          porque: string
          prazo_dias?: number
          publico: string
          resultado?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          brain?: Json
          canal?: string
          client_id?: string
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          esforco?: string
          estado?: string
          evidencias?: Json
          execucao_id?: string | null
          id?: string
          mensagem?: string | null
          metrica?: string
          oferta?: string | null
          passos?: Json
          porque?: string
          prazo_dias?: number
          publico?: string
          resultado?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanhas_ideias_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanhas_ideias_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "agente_execucoes"
            referencedColumns: ["id"]
          },
        ]
      }
      client_ad_accounts: {
        Row: {
          access_token: string | null
          active: boolean
          ad_account_id: string
          client_id: string
          created_at: string
          name: string | null
          provisional: boolean
        }
        Insert: {
          access_token?: string | null
          active?: boolean
          ad_account_id: string
          client_id: string
          created_at?: string
          name?: string | null
          provisional?: boolean
        }
        Update: {
          access_token?: string | null
          active?: boolean
          ad_account_id?: string
          client_id?: string
          created_at?: string
          name?: string | null
          provisional?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "client_ad_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_members: {
        Row: {
          client_id: string
          created_at: string
          id: string
          role: ClientMemberRole
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          role?: ClientMemberRole
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          role?: ClientMemberRole
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_modulos: {
        Row: {
          atualizado_em: string
          client_id: string
          criado_em: string
          criado_por: string | null
          fim: string | null
          inicio: string | null
          modulo: string
          origem: string | null
          status: string
        }
        Insert: {
          atualizado_em?: string
          client_id: string
          criado_em?: string
          criado_por?: string | null
          fim?: string | null
          inicio?: string | null
          modulo: string
          origem?: string | null
          status?: string
        }
        Update: {
          atualizado_em?: string
          client_id?: string
          criado_em?: string
          criado_por?: string | null
          fim?: string | null
          inicio?: string | null
          modulo?: string
          origem?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_modulos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          active: boolean
          ads_planilha_url: string | null
          avatar_url: string | null
          cfm_score_status: CfmScoreStatus | null
          created_at: string
          digisac_token: string | null
          digisac_url: string | null
          em_onboarding: boolean
          eh_teste: boolean
          id: string
          instagram_handle: string | null
          meta_ad_account_id: string | null
          name: string
          rotulo_custo: string
          specialty: string | null
          ticket_medio: number | null
          wts_api_token: string | null
          wts_company_id: string | null
          wts_department_ids: string[] | null
        }
        Insert: {
          active?: boolean
          ads_planilha_url?: string | null
          avatar_url?: string | null
          cfm_score_status?: CfmScoreStatus | null
          created_at?: string
          digisac_token?: string | null
          digisac_url?: string | null
          em_onboarding?: boolean
          eh_teste?: boolean
          id?: string
          instagram_handle?: string | null
          meta_ad_account_id?: string | null
          name: string
          rotulo_custo?: string
          specialty?: string | null
          ticket_medio?: number | null
          wts_api_token?: string | null
          wts_company_id?: string | null
          wts_department_ids?: string[] | null
        }
        Update: {
          active?: boolean
          ads_planilha_url?: string | null
          avatar_url?: string | null
          cfm_score_status?: CfmScoreStatus | null
          created_at?: string
          digisac_token?: string | null
          digisac_url?: string | null
          em_onboarding?: boolean
          eh_teste?: boolean
          id?: string
          instagram_handle?: string | null
          meta_ad_account_id?: string | null
          name?: string
          rotulo_custo?: string
          specialty?: string | null
          ticket_medio?: number | null
          wts_api_token?: string | null
          wts_company_id?: string | null
          wts_department_ids?: string[] | null
        }
        Relationships: []
      }
      conferencias_dados: {
        Row: {
          achados: Json
          concluida_em: string | null
          contas_vistas_na_meta: number | null
          etapas: Json
          id: string
          iniciada_em: string
          iniciada_por: string | null
          tokens_testados: number | null
          verificados: Json
        }
        Insert: {
          achados?: Json
          concluida_em?: string | null
          contas_vistas_na_meta?: number | null
          etapas?: Json
          id?: string
          iniciada_em?: string
          iniciada_por?: string | null
          tokens_testados?: number | null
          verificados?: Json
        }
        Update: {
          achados?: Json
          concluida_em?: string | null
          contas_vistas_na_meta?: number | null
          etapas?: Json
          id?: string
          iniciada_em?: string
          iniciada_por?: string | null
          tokens_testados?: number | null
          verificados?: Json
        }
        Relationships: []
      }
      content_angle_suggestions: {
        Row: {
          client_id: string
          created_at: string
          format: ContentFormat | null
          funnel_stage: FunnelStage | null
          generated_at: string
          id: string
          methodology_stage: MethodologyStage | null
          rationale: string
          status: SuggestionStatus
          tema: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          format?: ContentFormat | null
          funnel_stage?: FunnelStage | null
          generated_at?: string
          id?: string
          methodology_stage?: MethodologyStage | null
          rationale: string
          status?: SuggestionStatus
          tema?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          format?: ContentFormat | null
          funnel_stage?: FunnelStage | null
          generated_at?: string
          id?: string
          methodology_stage?: MethodologyStage | null
          rationale?: string
          status?: SuggestionStatus
          tema?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_angle_suggestions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      conversas: {
        Row: {
          canal: string | null
          client_id: string
          codigo_ref: string | null
          externo_id: string
          id: string
          iniciada_em: string | null
          lead_id: string | null
          pessoa_id: string | null
          provider: string
          ultima_msg_em: string | null
        }
        Insert: {
          canal?: string | null
          client_id: string
          codigo_ref?: string | null
          externo_id: string
          id?: string
          iniciada_em?: string | null
          lead_id?: string | null
          pessoa_id?: string | null
          provider: string
          ultima_msg_em?: string | null
        }
        Update: {
          canal?: string | null
          client_id?: string
          codigo_ref?: string | null
          externo_id?: string
          id?: string
          iniciada_em?: string | null
          lead_id?: string | null
          pessoa_id?: string | null
          provider?: string
          ultima_msg_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      conversas_origem_anuncio: {
        Row: {
          achado_em: string
          ad_id: string | null
          bruto: Json | null
          campaign_id: string | null
          client_id: string
          conversa_id: string
          ctwa_clid: string | null
          headline: string | null
          source_url: string | null
        }
        Insert: {
          achado_em?: string
          ad_id?: string | null
          bruto?: Json | null
          campaign_id?: string | null
          client_id: string
          conversa_id: string
          ctwa_clid?: string | null
          headline?: string | null
          source_url?: string | null
        }
        Update: {
          achado_em?: string
          ad_id?: string | null
          bruto?: Json | null
          campaign_id?: string | null
          client_id?: string
          conversa_id?: string
          ctwa_clid?: string | null
          headline?: string | null
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversas_origem_anuncio_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_origem_anuncio_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: true
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      conversas_resumos: {
        Row: {
          ate_msg_em: string | null
          client_id: string
          conversa_id: string
          gerado_em: string
          gerado_por: string | null
          modelo: string | null
          resumo: Json
        }
        Insert: {
          ate_msg_em?: string | null
          client_id: string
          conversa_id: string
          gerado_em?: string
          gerado_por?: string | null
          modelo?: string | null
          resumo: Json
        }
        Update: {
          ate_msg_em?: string | null
          client_id?: string
          conversa_id?: string
          gerado_em?: string
          gerado_por?: string | null
          modelo?: string | null
          resumo?: Json
        }
        Relationships: [
          {
            foreignKeyName: "conversas_resumos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_resumos_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: true
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contato_tags: {
        Row: {
          atualizado_em: string | null
          contato_id: string
          crm_connection_id: string
          lido_em: string
          tags: string[]
        }
        Insert: {
          atualizado_em?: string | null
          contato_id: string
          crm_connection_id: string
          lido_em?: string
          tags?: string[]
        }
        Update: {
          atualizado_em?: string | null
          contato_id?: string
          crm_connection_id?: string
          lido_em?: string
          tags?: string[]
        }
        Relationships: []
      }
      crm_connections: {
        Row: {
          access_token: string | null
          active: boolean
          client_id: string
          config: Json
          created_at: string
          id: string
          provider: CrmProvider
          subdomain: string | null
          webhook_secret: string | null
        }
        Insert: {
          access_token?: string | null
          active?: boolean
          client_id: string
          config?: Json
          created_at?: string
          id?: string
          provider: CrmProvider
          subdomain?: string | null
          webhook_secret?: string | null
        }
        Update: {
          access_token?: string | null
          active?: boolean
          client_id?: string
          config?: Json
          created_at?: string
          id?: string
          provider?: CrmProvider
          subdomain?: string | null
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_etapa_kpi: {
        Row: {
          atualizado_em: string
          crm_connection_id: string
          kpi: string
          origem: string
          pipeline_id: string
          status_id: string
        }
        Insert: {
          atualizado_em?: string
          crm_connection_id: string
          kpi: string
          origem?: string
          pipeline_id: string
          status_id: string
        }
        Update: {
          atualizado_em?: string
          crm_connection_id?: string
          kpi?: string
          origem?: string
          pipeline_id?: string
          status_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_etapa_kpi_crm_connection_id_fkey"
            columns: ["crm_connection_id"]
            isOneToOne: false
            referencedRelation: "crm_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_etapa_resultado: {
        Row: {
          atualizado_em: string
          confirmado_por: string | null
          crm_connection_id: string
          outcome: string
          pipeline_id: string
          status_id: string
        }
        Insert: {
          atualizado_em?: string
          confirmado_por?: string | null
          crm_connection_id: string
          outcome: string
          pipeline_id: string
          status_id: string
        }
        Update: {
          atualizado_em?: string
          confirmado_por?: string | null
          crm_connection_id?: string
          outcome?: string
          pipeline_id?: string
          status_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_etapa_resultado_crm_connection_id_fkey"
            columns: ["crm_connection_id"]
            isOneToOne: false
            referencedRelation: "crm_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_lead_eventos: {
        Row: {
          client_id: string
          crm_connection_id: string
          external_lead_id: string
          id: number
          ocorreu_em: string
          pipeline_de: string | null
          pipeline_para: string | null
          registrado_em: string
          status_de: string | null
          status_para: string | null
          tipo: string
        }
        Insert: {
          client_id: string
          crm_connection_id: string
          external_lead_id: string
          id?: number
          ocorreu_em?: string
          pipeline_de?: string | null
          pipeline_para?: string | null
          registrado_em?: string
          status_de?: string | null
          status_para?: string | null
          tipo: string
        }
        Update: {
          client_id?: string
          crm_connection_id?: string
          external_lead_id?: string
          id?: number
          ocorreu_em?: string
          pipeline_de?: string | null
          pipeline_para?: string | null
          registrado_em?: string
          status_de?: string | null
          status_para?: string | null
          tipo?: string
        }
        Relationships: []
      }
      crm_leads: {
        Row: {
          canal_id: string | null
          client_id: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          crm_connection_id: string
          event_type: string
          external_lead_id: string
          id: string
          occurred_at: string | null
          origem_como: string | null
          old_status_id: string | null
          outcome: string | null
          pessoa_id: string | null
          pipeline_id: string | null
          price: number | null
          provider: CrmProvider
          raw_payload: Json
          received_at: string
          removido_na_origem: string | null
          source: string | null
          status_id: string | null
        }
        Insert: {
          canal_id?: string | null
          client_id: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          crm_connection_id: string
          event_type: string
          external_lead_id: string
          id?: string
          occurred_at?: string | null
          origem_como?: string | null
          old_status_id?: string | null
          outcome?: string | null
          pessoa_id?: string | null
          pipeline_id?: string | null
          price?: number | null
          provider: CrmProvider
          raw_payload: Json
          received_at?: string
          removido_na_origem?: string | null
          source?: string | null
          status_id?: string | null
        }
        Update: {
          canal_id?: string | null
          client_id?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          crm_connection_id?: string
          event_type?: string
          external_lead_id?: string
          id?: string
          occurred_at?: string | null
          origem_como?: string | null
          old_status_id?: string | null
          outcome?: string | null
          pessoa_id?: string | null
          pipeline_id?: string | null
          price?: number | null
          provider?: CrmProvider
          raw_payload?: Json
          received_at?: string
          removido_na_origem?: string | null
          source?: string | null
          status_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_crm_connection_id_fkey"
            columns: ["crm_connection_id"]
            isOneToOne: false
            referencedRelation: "crm_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads_sync_state: {
        Row: {
          backfill_done: boolean
          crm_connection_id: string
          next_page: number
          updated_at: string
        }
        Insert: {
          backfill_done?: boolean
          crm_connection_id: string
          next_page?: number
          updated_at?: string
        }
        Update: {
          backfill_done?: boolean
          crm_connection_id?: string
          next_page?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_sync_state_crm_connection_id_fkey"
            columns: ["crm_connection_id"]
            isOneToOne: true
            referencedRelation: "crm_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_motivos_perda: {
        Row: {
          atualizado_em: string
          crm_connection_id: string
          motivo_id: string
          nome: string
        }
        Insert: {
          atualizado_em?: string
          crm_connection_id: string
          motivo_id: string
          nome: string
        }
        Update: {
          atualizado_em?: string
          crm_connection_id?: string
          motivo_id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_motivos_perda_crm_connection_id_fkey"
            columns: ["crm_connection_id"]
            isOneToOne: false
            referencedRelation: "crm_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_pipeline_statuses: {
        Row: {
          crm_connection_id: string
          fetched_at: string
          id: string
          pipeline_id: string
          pipeline_name: string
          status_id: string
          status_name: string
        }
        Insert: {
          crm_connection_id: string
          fetched_at?: string
          id?: string
          pipeline_id: string
          pipeline_name: string
          status_id: string
          status_name: string
        }
        Update: {
          crm_connection_id?: string
          fetched_at?: string
          id?: string
          pipeline_id?: string
          pipeline_name?: string
          status_id?: string
          status_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_pipeline_statuses_crm_connection_id_fkey"
            columns: ["crm_connection_id"]
            isOneToOne: false
            referencedRelation: "crm_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_raw_events: {
        Row: {
          client_id: string
          crm_connection_id: string
          event_key: string
          id: string
          raw_payload: Json
          received_at: string
        }
        Insert: {
          client_id: string
          crm_connection_id: string
          event_key: string
          id?: string
          raw_payload: Json
          received_at?: string
        }
        Update: {
          client_id?: string
          crm_connection_id?: string
          event_key?: string
          id?: string
          raw_payload?: Json
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_raw_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_raw_events_crm_connection_id_fkey"
            columns: ["crm_connection_id"]
            isOneToOne: false
            referencedRelation: "crm_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      experimentos_semana: {
        Row: {
          acao: string
          base_conversas: number | null
          base_n: number | null
          base_pct: number | null
          client_id: string
          concluido_em: string | null
          criado_em: string
          criado_por: string | null
          estado: string
          falha: string
          fim: string
          id: string
          inicio: string
          resultado_conversas: number | null
          resultado_n: number | null
          resultado_pct: number | null
        }
        Insert: {
          acao: string
          base_conversas?: number | null
          base_n?: number | null
          base_pct?: number | null
          client_id: string
          concluido_em?: string | null
          criado_em?: string
          criado_por?: string | null
          estado?: string
          falha: string
          fim: string
          id?: string
          inicio: string
          resultado_conversas?: number | null
          resultado_n?: number | null
          resultado_pct?: number | null
        }
        Update: {
          acao?: string
          base_conversas?: number | null
          base_n?: number | null
          base_pct?: number | null
          client_id?: string
          concluido_em?: string | null
          criado_em?: string
          criado_por?: string | null
          estado?: string
          falha?: string
          fim?: string
          id?: string
          inicio?: string
          resultado_conversas?: number | null
          resultado_n?: number | null
          resultado_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "experimentos_semana_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      fontes_nao_usadas: {
        Row: {
          client_id: string
          fonte: string
          marcado_em: string
          marcado_por: string | null
        }
        Insert: {
          client_id: string
          fonte: string
          marcado_em?: string
          marcado_por?: string | null
        }
        Update: {
          client_id?: string
          fonte?: string
          marcado_em?: string
          marcado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fontes_nao_usadas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_execucoes: {
        Row: {
          client_id: string | null
          criado_em: string
          custo_usd: number | null
          erro: string | null
          execucao_id: string | null
          finalidade: string
          id: number
          modelo: string | null
          ms: number | null
          ok: boolean
          tokens_entrada: number | null
          tokens_saida: number | null
        }
        Insert: {
          client_id?: string | null
          criado_em?: string
          custo_usd?: number | null
          erro?: string | null
          execucao_id?: string | null
          finalidade: string
          id?: number
          modelo?: string | null
          ms?: number | null
          ok: boolean
          tokens_entrada?: number | null
          tokens_saida?: number | null
        }
        Update: {
          client_id?: string | null
          criado_em?: string
          custo_usd?: number | null
          erro?: string | null
          execucao_id?: string | null
          finalidade?: string
          id?: number
          modelo?: string | null
          ms?: number | null
          ok?: boolean
          tokens_entrada?: number | null
          tokens_saida?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ia_execucoes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_execucoes_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "agente_execucoes"
            referencedColumns: ["id"]
          },
        ]
      }
      inspiration_posts: {
        Row: {
          como_adaptar: string | null
          created_at: string
          especialidade: string
          estrutura: string | null
          fonte_handle: string | null
          fonte_url: string | null
          formato: string | null
          gancho: string | null
          grupo: string
          id: string
          metrica_label: string | null
          metrica_valor: number | null
          midia: string
          multiplicador_mediana: number | null
          por_que_funcionou: string | null
          replicabilidade: string | null
          replicabilidade_texto: string | null
          titulo: string | null
        }
        Insert: {
          como_adaptar?: string | null
          created_at?: string
          especialidade: string
          estrutura?: string | null
          fonte_handle?: string | null
          fonte_url?: string | null
          formato?: string | null
          gancho?: string | null
          grupo: string
          id?: string
          metrica_label?: string | null
          metrica_valor?: number | null
          midia: string
          multiplicador_mediana?: number | null
          por_que_funcionou?: string | null
          replicabilidade?: string | null
          replicabilidade_texto?: string | null
          titulo?: string | null
        }
        Update: {
          como_adaptar?: string | null
          created_at?: string
          especialidade?: string
          estrutura?: string | null
          fonte_handle?: string | null
          fonte_url?: string | null
          formato?: string | null
          gancho?: string | null
          grupo?: string
          id?: string
          metrica_label?: string | null
          metrica_valor?: number | null
          midia?: string
          multiplicador_mediana?: number | null
          por_que_funcionou?: string | null
          replicabilidade?: string | null
          replicabilidade_texto?: string | null
          titulo?: string | null
        }
        Relationships: []
      }
      instagram_account_daily_metrics: {
        Row: {
          client_id: string
          comments: number | null
          created_at: string
          date: string
          followers_count: number | null
          id: string
          instagram_account_id: string
          likes: number | null
          new_followers: number | null
          profile_links_taps: number | null
          reach: number | null
          saves: number | null
          shares: number | null
          total_interactions: number | null
          unfollowers: number | null
        }
        Insert: {
          client_id: string
          comments?: number | null
          created_at?: string
          date: string
          followers_count?: number | null
          id?: string
          instagram_account_id: string
          likes?: number | null
          new_followers?: number | null
          profile_links_taps?: number | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          total_interactions?: number | null
          unfollowers?: number | null
        }
        Update: {
          client_id?: string
          comments?: number | null
          created_at?: string
          date?: string
          followers_count?: number | null
          id?: string
          instagram_account_id?: string
          likes?: number | null
          new_followers?: number | null
          profile_links_taps?: number | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          total_interactions?: number | null
          unfollowers?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_account_daily_metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_account_daily_metrics_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_account_secrets: {
        Row: {
          instagram_account_id: string
          meta_access_token: string | null
          nota: string | null
          updated_at: string
        }
        Insert: {
          instagram_account_id: string
          meta_access_token?: string | null
          nota?: string | null
          updated_at?: string
        }
        Update: {
          instagram_account_id?: string
          meta_access_token?: string | null
          nota?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_account_secrets_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: true
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_accounts: {
        Row: {
          active: boolean
          client_id: string
          connected_manually: boolean
          created_at: string
          id: string
          ig_user_id: string | null
          ig_username: string | null
          provisional: boolean
          sync_source: string
          windsor_account_id: string
        }
        Insert: {
          active?: boolean
          client_id: string
          connected_manually?: boolean
          created_at?: string
          id?: string
          ig_user_id?: string | null
          ig_username?: string | null
          provisional?: boolean
          sync_source?: string
          windsor_account_id: string
        }
        Update: {
          active?: boolean
          client_id?: string
          connected_manually?: boolean
          created_at?: string
          id?: string
          ig_user_id?: string | null
          ig_username?: string | null
          provisional?: boolean
          sync_source?: string
          windsor_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_backfill_state: {
        Row: {
          backfill_done: boolean
          instagram_account_id: string
          next_cursor: string | null
          updated_at: string
        }
        Insert: {
          backfill_done?: boolean
          instagram_account_id: string
          next_cursor?: string | null
          updated_at?: string
        }
        Update: {
          backfill_done?: boolean
          instagram_account_id?: string
          next_cursor?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_backfill_state_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: true
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_comments: {
        Row: {
          author_username: string | null
          client_id: string
          commented_at: string | null
          created_at: string
          external_comment_id: string
          id: string
          instagram_post_id: string
          is_question: boolean
          like_count: number | null
          text: string
        }
        Insert: {
          author_username?: string | null
          client_id: string
          commented_at?: string | null
          created_at?: string
          external_comment_id: string
          id?: string
          instagram_post_id: string
          is_question?: boolean
          like_count?: number | null
          text: string
        }
        Update: {
          author_username?: string | null
          client_id?: string
          commented_at?: string | null
          created_at?: string
          external_comment_id?: string
          id?: string
          instagram_post_id?: string
          is_question?: boolean
          like_count?: number | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_comments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_comments_instagram_post_id_fkey"
            columns: ["instagram_post_id"]
            isOneToOne: false
            referencedRelation: "instagram_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_comments_sync_state: {
        Row: {
          instagram_account_id: string
          last_synced_post_posted_at: string | null
          updated_at: string
        }
        Insert: {
          instagram_account_id: string
          last_synced_post_posted_at?: string | null
          updated_at?: string
        }
        Update: {
          instagram_account_id?: string
          last_synced_post_posted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_comments_sync_state_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: true
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_posts: {
        Row: {
          caption: string | null
          client_id: string
          comments: number | null
          created_at: string
          engagement: number | null
          format: ContentFormat | null
          funnel_stage: FunnelStage | null
          id: string
          instagram_account_id: string
          likes: number | null
          media_follows: number | null
          media_type: string | null
          methodology_stage: MethodologyStage | null
          metrics_updated_at: string | null
          permalink: string | null
          posted_at: string | null
          profile_visits: number | null
          reach: number | null
          reel_avg_watch_time_ms: number | null
          reel_skip_rate: number | null
          reel_total_watch_time_ms: number | null
          saved: number | null
          shares: number | null
          tema: string | null
          thumbnail_url: string | null
          views: number | null
          windsor_media_id: string
        }
        Insert: {
          caption?: string | null
          client_id: string
          comments?: number | null
          created_at?: string
          engagement?: number | null
          format?: ContentFormat | null
          funnel_stage?: FunnelStage | null
          id?: string
          instagram_account_id: string
          likes?: number | null
          media_follows?: number | null
          media_type?: string | null
          methodology_stage?: MethodologyStage | null
          metrics_updated_at?: string | null
          permalink?: string | null
          posted_at?: string | null
          profile_visits?: number | null
          reach?: number | null
          reel_avg_watch_time_ms?: number | null
          reel_skip_rate?: number | null
          reel_total_watch_time_ms?: number | null
          saved?: number | null
          shares?: number | null
          tema?: string | null
          thumbnail_url?: string | null
          views?: number | null
          windsor_media_id: string
        }
        Update: {
          caption?: string | null
          client_id?: string
          comments?: number | null
          created_at?: string
          engagement?: number | null
          format?: ContentFormat | null
          funnel_stage?: FunnelStage | null
          id?: string
          instagram_account_id?: string
          likes?: number | null
          media_follows?: number | null
          media_type?: string | null
          methodology_stage?: MethodologyStage | null
          metrics_updated_at?: string | null
          permalink?: string | null
          posted_at?: string | null
          profile_visits?: number | null
          reach?: number | null
          reel_avg_watch_time_ms?: number | null
          reel_skip_rate?: number | null
          reel_total_watch_time_ms?: number | null
          saved?: number | null
          shares?: number | null
          tema?: string | null
          thumbnail_url?: string | null
          views?: number | null
          windsor_media_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_posts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_posts_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_stories: {
        Row: {
          client_id: string
          created_at: string
          follows: number | null
          id: string
          ig_media_id: string
          instagram_account_id: string
          media_type: string | null
          metrics_updated_at: string
          permalink: string | null
          posted_at: string | null
          profile_visits: number | null
          reach: number | null
          replies: number | null
          shares: number | null
          thumbnail_url: string | null
          total_interactions: number | null
          views: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          follows?: number | null
          id?: string
          ig_media_id: string
          instagram_account_id: string
          media_type?: string | null
          metrics_updated_at?: string
          permalink?: string | null
          posted_at?: string | null
          profile_visits?: number | null
          reach?: number | null
          replies?: number | null
          shares?: number | null
          thumbnail_url?: string | null
          total_interactions?: number | null
          views?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          follows?: number | null
          id?: string
          ig_media_id?: string
          instagram_account_id?: string
          media_type?: string | null
          metrics_updated_at?: string
          permalink?: string | null
          posted_at?: string | null
          profile_visits?: number | null
          reach?: number | null
          replies?: number | null
          shares?: number | null
          thumbnail_url?: string | null
          total_interactions?: number | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_stories_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_stories_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      links_rastreados: {
        Row: {
          ad_campaign_id: string | null
          client_id: string
          cliques_atualizado_em: string | null
          cliques_total: number
          codigo_ref: string
          criado_em: string
          criado_por: string | null
          destino_url: string
          id: string
          instagram_post_id: string | null
          mensagem_modelo: string | null
          short_url: string | null
          shortio_id: string | null
          tipo: string
          titulo: string | null
          utm: Json
        }
        Insert: {
          ad_campaign_id?: string | null
          client_id: string
          cliques_atualizado_em?: string | null
          cliques_total?: number
          codigo_ref: string
          criado_em?: string
          criado_por?: string | null
          destino_url: string
          id?: string
          instagram_post_id?: string | null
          mensagem_modelo?: string | null
          short_url?: string | null
          shortio_id?: string | null
          tipo: string
          titulo?: string | null
          utm?: Json
        }
        Update: {
          ad_campaign_id?: string | null
          client_id?: string
          cliques_atualizado_em?: string | null
          cliques_total?: number
          codigo_ref?: string
          criado_em?: string
          criado_por?: string | null
          destino_url?: string
          id?: string
          instagram_post_id?: string | null
          mensagem_modelo?: string | null
          short_url?: string | null
          shortio_id?: string | null
          tipo?: string
          titulo?: string | null
          utm?: Json
        }
        Relationships: [
          {
            foreignKeyName: "links_rastreados_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "links_rastreados_instagram_post_id_fkey"
            columns: ["instagram_post_id"]
            isOneToOne: false
            referencedRelation: "instagram_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_chamadas: {
        Row: {
          client_id: string | null
          em: string
          erro: string | null
          ferramenta: string
          id: number
          ms: number | null
          oauth_client_id: string | null
          ok: boolean
          user_id: string
        }
        Insert: {
          client_id?: string | null
          em?: string
          erro?: string | null
          ferramenta: string
          id?: number
          ms?: number | null
          oauth_client_id?: string | null
          ok: boolean
          user_id: string
        }
        Update: {
          client_id?: string | null
          em?: string
          erro?: string | null
          ferramenta?: string
          id?: number
          ms?: number | null
          oauth_client_id?: string | null
          ok?: boolean
          user_id?: string
        }
        Relationships: []
      }
      mensagens: {
        Row: {
          autor: string | null
          client_id: string
          conversa_id: string
          direcao: string
          enviada_em: string
          externo_id: string
          id: string
          texto: string | null
          tipo: string
        }
        Insert: {
          autor?: string | null
          client_id: string
          conversa_id: string
          direcao: string
          enviada_em: string
          externo_id: string
          id?: string
          texto?: string | null
          tipo?: string
        }
        Update: {
          autor?: string | null
          client_id?: string
          conversa_id?: string
          direcao?: string
          enviada_em?: string
          externo_id?: string
          id?: string
          texto?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ads_campaigns: {
        Row: {
          ad_account_id: string
          campaign_id: string
          client_id: string
          instagram_media_id: string | null
          name: string
          objective: string | null
          destinos: string[] | null
          otimizacoes: string[] | null
          permalink: string | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          ad_account_id: string
          campaign_id: string
          client_id: string
          instagram_media_id?: string | null
          name: string
          objective?: string | null
          destinos?: string[] | null
          otimizacoes?: string[] | null
          permalink?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          ad_account_id?: string
          campaign_id?: string
          client_id?: string
          instagram_media_id?: string | null
          name?: string
          objective?: string | null
          destinos?: string[] | null
          otimizacoes?: string[] | null
          permalink?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ads_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ads_daily: {
        Row: {
          ad_account_id: string
          campaign_id: string
          clicks: number
          client_id: string
          conversations: number
          created_at: string
          date: string
          frequency: number | null
          id: string
          impressions: number
          landing_page_views: number
          leads: number
          link_clicks: number
          reach: number
          spend: number
          unique_clicks: number
          updated_at: string
        }
        Insert: {
          ad_account_id: string
          campaign_id: string
          clicks?: number
          client_id: string
          conversations?: number
          created_at?: string
          date: string
          frequency?: number | null
          id?: string
          impressions?: number
          landing_page_views?: number
          leads?: number
          link_clicks?: number
          reach?: number
          spend?: number
          unique_clicks?: number
          updated_at?: string
        }
        Update: {
          ad_account_id?: string
          campaign_id?: string
          clicks?: number
          client_id?: string
          conversations?: number
          created_at?: string
          date?: string
          frequency?: number | null
          id?: string
          impressions?: number
          landing_page_views?: number
          leads?: number
          link_clicks?: number
          reach?: number
          spend?: number
          unique_clicks?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ads_daily_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ads_sync_state: {
        Row: {
          ad_account_id: string
          last_date_synced: string | null
          updated_at: string
        }
        Insert: {
          ad_account_id: string
          last_date_synced?: string | null
          updated_at?: string
        }
        Update: {
          ad_account_id?: string
          last_date_synced?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      onb_submissions: {
        Row: {
          answers: Json
          checklist: Json
          checklist_pre: Json | null
          city: string | null
          clinic_name: string | null
          contact_name: string | null
          created_at: string | null
          docs: Json
          docs_done: Json
          email: string | null
          ficha_baseline: Json | null
          id: string
          internal_notes: string | null
          link_grupo: string | null
          link_sistema: string | null
          relatorio_diagnostico: string | null
          role: string | null
          specialty: string | null
          status: string | null
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          answers?: Json
          checklist?: Json
          checklist_pre?: Json | null
          city?: string | null
          clinic_name?: string | null
          contact_name?: string | null
          created_at?: string | null
          docs?: Json
          docs_done?: Json
          email?: string | null
          ficha_baseline?: Json | null
          id?: string
          internal_notes?: string | null
          link_grupo?: string | null
          link_sistema?: string | null
          relatorio_diagnostico?: string | null
          role?: string | null
          specialty?: string | null
          status?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          answers?: Json
          checklist?: Json
          checklist_pre?: Json | null
          city?: string | null
          clinic_name?: string | null
          contact_name?: string | null
          created_at?: string | null
          docs?: Json
          docs_done?: Json
          email?: string | null
          ficha_baseline?: Json | null
          id?: string
          internal_notes?: string | null
          link_grupo?: string | null
          link_sistema?: string | null
          relatorio_diagnostico?: string | null
          role?: string | null
          specialty?: string | null
          status?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      origens_texto: {
        Row: {
          client_id: string
          criado_em: string
          criado_por: string | null
          id: string
          origem: string
          padrao: string
          rotulo: string | null
        }
        Insert: {
          client_id: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          origem: string
          padrao: string
          rotulo?: string | null
        }
        Update: {
          client_id?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          origem?: string
          padrao?: string
          rotulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "origens_texto_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      pautas_conteudo: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          aviso: string | null
          client_id: string
          criado_em: string
          cta: string | null
          dia: string | null
          formato: string
          gancho: string | null
          id: string
          ideia_id: string | null
          motivo: string | null
          objetivo: string
          origem_texto: string | null
          origem_tipo: string
          post_id: string | null
          roteiro: Json
          status: string
          titulo: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          aviso?: string | null
          client_id: string
          criado_em?: string
          cta?: string | null
          dia?: string | null
          formato: string
          gancho?: string | null
          id?: string
          ideia_id?: string | null
          motivo?: string | null
          objetivo: string
          origem_texto?: string | null
          origem_tipo?: string
          post_id?: string | null
          roteiro?: Json
          status?: string
          titulo: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          aviso?: string | null
          client_id?: string
          criado_em?: string
          cta?: string | null
          dia?: string | null
          formato?: string
          gancho?: string | null
          id?: string
          ideia_id?: string | null
          motivo?: string | null
          objetivo?: string
          origem_texto?: string | null
          origem_tipo?: string
          post_id?: string | null
          roteiro?: Json
          status?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pautas_conteudo_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pautas_conteudo_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "instagram_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_respostas: {
        Row: {
          brevo_resp: string | null
          brevo_status: number | null
          created_at: string | null
          email: string
          id: number
          origem: string | null
          perfil: string
          synced_brevo: boolean | null
        }
        Insert: {
          brevo_resp?: string | null
          brevo_status?: number | null
          created_at?: string | null
          email: string
          id?: never
          origem?: string | null
          perfil: string
          synced_brevo?: boolean | null
        }
        Update: {
          brevo_resp?: string | null
          brevo_status?: number | null
          created_at?: string | null
          email?: string
          id?: never
          origem?: string | null
          perfil?: string
          synced_brevo?: boolean | null
        }
        Relationships: []
      }
      pessoas: {
        Row: {
          atualizado_em: string
          client_id: string
          criado_em: string
          email: string | null
          id: string
          ig_username: string | null
          nome: string | null
          origem_primeira: string | null
          primeiro_toque_em: string | null
          telefone: string | null
          telefone_chave: string | null
        }
        Insert: {
          atualizado_em?: string
          client_id: string
          criado_em?: string
          email?: string | null
          id?: string
          ig_username?: string | null
          nome?: string | null
          origem_primeira?: string | null
          primeiro_toque_em?: string | null
          telefone?: string | null
          telefone_chave?: string | null
        }
        Update: {
          atualizado_em?: string
          client_id?: string
          criado_em?: string
          email?: string | null
          id?: string
          ig_username?: string | null
          nome?: string | null
          origem_primeira?: string | null
          primeiro_toque_em?: string | null
          telefone?: string | null
          telefone_chave?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pessoas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoas_equipe: {
        Row: {
          ativa: boolean
          atualizado_em: string
          client_id: string | null
          criado_em: string
          criado_por: string | null
          email: string | null
          funcoes: string[]
          id: string
          nome: string
          observacao: string | null
          tipo: string
          user_id: string | null
          whatsapp: string | null
        }
        Insert: {
          ativa?: boolean
          atualizado_em?: string
          client_id?: string | null
          criado_em?: string
          criado_por?: string | null
          email?: string | null
          funcoes?: string[]
          id?: string
          nome: string
          observacao?: string | null
          tipo?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Update: {
          ativa?: boolean
          atualizado_em?: string
          client_id?: string | null
          criado_em?: string
          criado_por?: string | null
          email?: string | null
          funcoes?: string[]
          id?: string
          nome?: string
          observacao?: string | null
          tipo?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pessoas_equipe_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_acessos: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          clinica_id: string
          confirmado_em: string | null
          confirmado_por: string | null
          item: string
          observacao: string | null
          revogado_em: string | null
          status: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          clinica_id: string
          confirmado_em?: string | null
          confirmado_por?: string | null
          item: string
          observacao?: string | null
          revogado_em?: string | null
          status?: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          clinica_id?: string
          confirmado_em?: string | null
          confirmado_por?: string | null
          item?: string
          observacao?: string | null
          revogado_em?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sap_acessos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_acoes: {
        Row: {
          atualizado_em: string
          clinica_id: string
          codigo: string | null
          criado_em: string
          criado_por: string | null
          id: string
          lado: string
          origem: string
          prazo: string | null
          removido_em: string | null
          responsavel: string | null
          resultado: string | null
          semana: string
          status: string
          texto: string
        }
        Insert: {
          atualizado_em?: string
          clinica_id: string
          codigo?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          lado: string
          origem: string
          prazo?: string | null
          removido_em?: string | null
          responsavel?: string | null
          resultado?: string | null
          semana: string
          status?: string
          texto: string
        }
        Update: {
          atualizado_em?: string
          clinica_id?: string
          codigo?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          lado?: string
          origem?: string
          prazo?: string | null
          removido_em?: string | null
          responsavel?: string | null
          resultado?: string | null
          semana?: string
          status?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "sap_acoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_atrasos: {
        Row: {
          categoria: string
          clinica_id: string
          criado_em: string
          criado_por: string | null
          data: string
          descricao: string | null
          dias_uteis: number
          id: string
          removido_em: string | null
        }
        Insert: {
          categoria: string
          clinica_id: string
          criado_em?: string
          criado_por?: string | null
          data: string
          descricao?: string | null
          dias_uteis: number
          id?: string
          removido_em?: string | null
        }
        Update: {
          categoria?: string
          clinica_id?: string
          criado_em?: string
          criado_por?: string | null
          data?: string
          descricao?: string | null
          dias_uteis?: number
          id?: string
          removido_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sap_atrasos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_auditoria_semana: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          clinica_id: string
          confirmacao_vespera: number | null
          conversas: number | null
          f1_24h: number | null
          nota_media: number | null
          observacao: string | null
          pensando_cadencia: number | null
          semana: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          clinica_id: string
          confirmacao_vespera?: number | null
          conversas?: number | null
          f1_24h?: number | null
          nota_media?: number | null
          observacao?: string | null
          pensando_cadencia?: number | null
          semana: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          clinica_id?: string
          confirmacao_vespera?: number | null
          conversas?: number | null
          f1_24h?: number | null
          nota_media?: number | null
          observacao?: string | null
          pensando_cadencia?: number | null
          semana?: string
        }
        Relationships: [
          {
            foreignKeyName: "sap_auditoria_semana_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_clinicas: {
        Row: {
          aceite_metas_em: string | null
          aceite_metas_por: string | null
          ajustes_acordados: string | null
          ambicao_d90: string | null
          atualizado_em: string | null
          baseline_ate: string | null
          baseline_de: string | null
          caminho_tecnologia: string | null
          categoria_fonte_meta: string | null
          categoria_verificada_em: string | null
          cidade: string | null
          clickup_folder_id: string | null
          client_id: string | null
          consulta_paga: boolean
          conversoes_google: boolean
          conversoes_meta: boolean
          coordenador: string | null
          created_at: string | null
          d0: string | null
          decisor_contato: string | null
          decisor_nome: string | null
          drive_pasta_url: string | null
          especialidade: string | null
          garantia_inicio: string | null
          garantia_status: string | null
          google_acoes_conversao: Json | null
          google_ads_customer_id: string | null
          id: string
          meta_ad_account_id: string | null
          meta_pixel_id: string | null
          nome: string
          piloto: boolean
          pos_contrato: string | null
          rastreamento_conferido_em: string | null
          rastreamento_conferido_por: string | null
          score_execucao: number | null
          servicos: string[] | null
          status: string | null
          status_categoria_meta: string | null
          ticket_medio: number | null
          verba_em_dia: boolean
          verba_mensal: number | null
          whatsapp_numero: string | null
        }
        Insert: {
          aceite_metas_em?: string | null
          aceite_metas_por?: string | null
          ajustes_acordados?: string | null
          ambicao_d90?: string | null
          atualizado_em?: string | null
          baseline_ate?: string | null
          baseline_de?: string | null
          caminho_tecnologia?: string | null
          categoria_fonte_meta?: string | null
          categoria_verificada_em?: string | null
          cidade?: string | null
          clickup_folder_id?: string | null
          client_id?: string | null
          consulta_paga?: boolean
          conversoes_google?: boolean
          conversoes_meta?: boolean
          coordenador?: string | null
          created_at?: string | null
          d0?: string | null
          decisor_contato?: string | null
          decisor_nome?: string | null
          drive_pasta_url?: string | null
          especialidade?: string | null
          garantia_inicio?: string | null
          garantia_status?: string | null
          google_acoes_conversao?: Json | null
          google_ads_customer_id?: string | null
          id?: string
          meta_ad_account_id?: string | null
          meta_pixel_id?: string | null
          nome: string
          piloto?: boolean
          pos_contrato?: string | null
          rastreamento_conferido_em?: string | null
          rastreamento_conferido_por?: string | null
          score_execucao?: number | null
          servicos?: string[] | null
          status?: string | null
          status_categoria_meta?: string | null
          ticket_medio?: number | null
          verba_em_dia?: boolean
          verba_mensal?: number | null
          whatsapp_numero?: string | null
        }
        Update: {
          aceite_metas_em?: string | null
          aceite_metas_por?: string | null
          ajustes_acordados?: string | null
          ambicao_d90?: string | null
          atualizado_em?: string | null
          baseline_ate?: string | null
          baseline_de?: string | null
          caminho_tecnologia?: string | null
          categoria_fonte_meta?: string | null
          categoria_verificada_em?: string | null
          cidade?: string | null
          clickup_folder_id?: string | null
          client_id?: string | null
          consulta_paga?: boolean
          conversoes_google?: boolean
          conversoes_meta?: boolean
          coordenador?: string | null
          created_at?: string | null
          d0?: string | null
          decisor_contato?: string | null
          decisor_nome?: string | null
          drive_pasta_url?: string | null
          especialidade?: string | null
          garantia_inicio?: string | null
          garantia_status?: string | null
          google_acoes_conversao?: Json | null
          google_ads_customer_id?: string | null
          id?: string
          meta_ad_account_id?: string | null
          meta_pixel_id?: string | null
          nome?: string
          piloto?: boolean
          pos_contrato?: string | null
          rastreamento_conferido_em?: string | null
          rastreamento_conferido_por?: string | null
          score_execucao?: number | null
          servicos?: string[] | null
          status?: string | null
          status_categoria_meta?: string | null
          ticket_medio?: number | null
          verba_em_dia?: boolean
          verba_mensal?: number | null
          whatsapp_numero?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sap_clinicas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_conversoes: {
        Row: {
          clinica_id: string
          criado_em: string
          crm_connection_id: string
          enviado_em: string | null
          etapa: string
          external_lead_id: string
          id: number
          motivo: string | null
          ocorreu_em: string
          plataforma: string
          status: string
          tentativas: number
        }
        Insert: {
          clinica_id: string
          criado_em?: string
          crm_connection_id: string
          enviado_em?: string | null
          etapa: string
          external_lead_id: string
          id?: number
          motivo?: string | null
          ocorreu_em: string
          plataforma: string
          status?: string
          tentativas?: number
        }
        Update: {
          clinica_id?: string
          criado_em?: string
          crm_connection_id?: string
          enviado_em?: string | null
          etapa?: string
          external_lead_id?: string
          id?: number
          motivo?: string | null
          ocorreu_em?: string
          plataforma?: string
          status?: string
          tentativas?: number
        }
        Relationships: [
          {
            foreignKeyName: "sap_conversoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sap_conversoes_crm_connection_id_fkey"
            columns: ["crm_connection_id"]
            isOneToOne: false
            referencedRelation: "crm_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_documento_texto: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          clinica_id: string
          documento: string
          secao: string
          texto: string | null
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          clinica_id: string
          documento: string
          secao: string
          texto?: string | null
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          clinica_id?: string
          documento?: string
          secao?: string
          texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sap_documento_texto_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_etapa_marco: {
        Row: {
          atualizado_em: string
          crm_connection_id: string
          marco: string | null
          pipeline_id: string
          status_id: string
        }
        Insert: {
          atualizado_em?: string
          crm_connection_id: string
          marco?: string | null
          pipeline_id: string
          status_id: string
        }
        Update: {
          atualizado_em?: string
          crm_connection_id?: string
          marco?: string | null
          pipeline_id?: string
          status_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sap_etapa_marco_crm_connection_id_fkey"
            columns: ["crm_connection_id"]
            isOneToOne: false
            referencedRelation: "crm_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_etapa_sinal: {
        Row: {
          ativo: boolean
          atualizado_em: string
          crm_connection_id: string
          pipeline_id: string
          sinal: string
          status_id: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          crm_connection_id: string
          pipeline_id: string
          sinal: string
          status_id: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          crm_connection_id?: string
          pipeline_id?: string
          sinal?: string
          status_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sap_etapa_sinal_crm_connection_id_fkey"
            columns: ["crm_connection_id"]
            isOneToOne: false
            referencedRelation: "crm_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_eventos: {
        Row: {
          clinica_id: string | null
          created_at: string | null
          id: number
          lead_id: string | null
          payload: Json | null
          tipo: string
        }
        Insert: {
          clinica_id?: string | null
          created_at?: string | null
          id?: number
          lead_id?: string | null
          payload?: Json | null
          tipo: string
        }
        Update: {
          clinica_id?: string | null
          created_at?: string | null
          id?: number
          lead_id?: string | null
          payload?: Json | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "sap_eventos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sap_eventos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sap_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_execucao_item: {
        Row: {
          atualizado_em: string
          clinica_id: string
          data_cumpriu: string | null
          evidencia: string | null
          item: number
          observacao: string | null
          peso: number
          status: string
        }
        Insert: {
          atualizado_em?: string
          clinica_id: string
          data_cumpriu?: string | null
          evidencia?: string | null
          item: number
          observacao?: string | null
          peso?: number
          status?: string
        }
        Update: {
          atualizado_em?: string
          clinica_id?: string
          data_cumpriu?: string | null
          evidencia?: string | null
          item?: number
          observacao?: string | null
          peso?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sap_execucao_item_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_fidelizacao_semana: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          avaliacoes_google: number | null
          clinica_id: string
          contatados_reativacao: number | null
          contatados_regua: number | null
          indicacoes: number | null
          indicacoes_com_codigo: number | null
          reativados_agendaram: number | null
          recompras: number | null
          retornos: number | null
          sair: number | null
          semana: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          avaliacoes_google?: number | null
          clinica_id: string
          contatados_reativacao?: number | null
          contatados_regua?: number | null
          indicacoes?: number | null
          indicacoes_com_codigo?: number | null
          reativados_agendaram?: number | null
          recompras?: number | null
          retornos?: number | null
          sair?: number | null
          semana: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          avaliacoes_google?: number | null
          clinica_id?: string
          contatados_reativacao?: number | null
          contatados_regua?: number | null
          indicacoes?: number | null
          indicacoes_com_codigo?: number | null
          reativados_agendaram?: number | null
          recompras?: number | null
          retornos?: number | null
          sair?: number | null
          semana?: string
        }
        Relationships: [
          {
            foreignKeyName: "sap_fidelizacao_semana_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_kpi_plano: {
        Row: {
          amostra: number | null
          atualizado_em: string
          baseline: number | null
          clinica_id: string
          conta_garantia: boolean
          kpi: string
          meta: number | null
          origem: string | null
        }
        Insert: {
          amostra?: number | null
          atualizado_em?: string
          baseline?: number | null
          clinica_id: string
          conta_garantia?: boolean
          kpi: string
          meta?: number | null
          origem?: string | null
        }
        Update: {
          amostra?: number | null
          atualizado_em?: string
          baseline?: number | null
          clinica_id?: string
          conta_garantia?: boolean
          kpi?: string
          meta?: number | null
          origem?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sap_kpi_plano_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_leads: {
        Row: {
          agendou: boolean | null
          canal: string | null
          capi_enviado_em: string | null
          clinica_id: string
          compareceu: string | null
          created_at: string | null
          data_consulta: string | null
          data_entrada: string | null
          decisao: string | null
          email_hash: string | null
          fbc: string | null
          fbclid: string | null
          fbp: string | null
          gbraid: string | null
          gclid: string | null
          google_offline_enviado_em: string | null
          id: string
          meta_lead_id: string | null
          motivo_categoria: string | null
          motivo_literal: string | null
          pontuacao: string | null
          servico: string | null
          status_cadencia: string | null
          telefone_hash: string | null
          tempo_primeira_resposta_min: number | null
          toque_fechamento: string | null
          updated_at: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          valor_apresentado: number | null
          valor_fechado: number | null
          wbraid: string | null
        }
        Insert: {
          agendou?: boolean | null
          canal?: string | null
          capi_enviado_em?: string | null
          clinica_id: string
          compareceu?: string | null
          created_at?: string | null
          data_consulta?: string | null
          data_entrada?: string | null
          decisao?: string | null
          email_hash?: string | null
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          gbraid?: string | null
          gclid?: string | null
          google_offline_enviado_em?: string | null
          id: string
          meta_lead_id?: string | null
          motivo_categoria?: string | null
          motivo_literal?: string | null
          pontuacao?: string | null
          servico?: string | null
          status_cadencia?: string | null
          telefone_hash?: string | null
          tempo_primeira_resposta_min?: number | null
          toque_fechamento?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          valor_apresentado?: number | null
          valor_fechado?: number | null
          wbraid?: string | null
        }
        Update: {
          agendou?: boolean | null
          canal?: string | null
          capi_enviado_em?: string | null
          clinica_id?: string
          compareceu?: string | null
          created_at?: string | null
          data_consulta?: string | null
          data_entrada?: string | null
          decisao?: string | null
          email_hash?: string | null
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          gbraid?: string | null
          gclid?: string | null
          google_offline_enviado_em?: string | null
          id?: string
          meta_lead_id?: string | null
          motivo_categoria?: string | null
          motivo_literal?: string | null
          pontuacao?: string | null
          servico?: string | null
          status_cadencia?: string | null
          telefone_hash?: string | null
          tempo_primeira_resposta_min?: number | null
          toque_fechamento?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          valor_apresentado?: number | null
          valor_fechado?: number | null
          wbraid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sap_leads_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_marco_status: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          clinica_id: string
          concluido_em: string | null
          desfeito_em: string | null
          desfeito_motivo: string | null
          desfeito_por: string | null
          detectado_em: string | null
          estado: string | null
          evidencia: string | null
          marco: number
          observacao: string | null
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          clinica_id: string
          concluido_em?: string | null
          desfeito_em?: string | null
          desfeito_motivo?: string | null
          desfeito_por?: string | null
          detectado_em?: string | null
          estado?: string | null
          evidencia?: string | null
          marco: number
          observacao?: string | null
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          clinica_id?: string
          concluido_em?: string | null
          desfeito_em?: string | null
          desfeito_motivo?: string | null
          desfeito_por?: string | null
          detectado_em?: string | null
          estado?: string | null
          evidencia?: string | null
          marco?: number
          observacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sap_marco_status_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_metas: {
        Row: {
          clinica_id: string
          etapa: string
          mes: string
          meta: number
        }
        Insert: {
          clinica_id: string
          etapa: string
          mes: string
          meta: number
        }
        Update: {
          clinica_id?: string
          etapa?: string
          mes?: string
          meta?: number
        }
        Relationships: [
          {
            foreignKeyName: "sap_metas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_metricas_diarias: {
        Row: {
          alcance: number | null
          canal: string
          clinica_id: string
          cliques: number | null
          data: string
          impressoes: number | null
          investimento: number | null
          leads_plataforma: number | null
        }
        Insert: {
          alcance?: number | null
          canal: string
          clinica_id: string
          cliques?: number | null
          data: string
          impressoes?: number | null
          investimento?: number | null
          leads_plataforma?: number | null
        }
        Update: {
          alcance?: number | null
          canal?: string
          clinica_id?: string
          cliques?: number | null
          data?: string
          impressoes?: number | null
          investimento?: number | null
          leads_plataforma?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sap_metricas_diarias_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_motivo_categoria: {
        Row: {
          atualizado_em: string
          categoria: string
          crm_connection_id: string
          motivo_id: string
        }
        Insert: {
          atualizado_em?: string
          categoria: string
          crm_connection_id: string
          motivo_id: string
        }
        Update: {
          atualizado_em?: string
          categoria?: string
          crm_connection_id?: string
          motivo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sap_motivo_categoria_crm_connection_id_fkey"
            columns: ["crm_connection_id"]
            isOneToOne: false
            referencedRelation: "crm_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_papeis: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          clinica_id: string
          papel: string
          pessoa_id: string | null
          user_id: string | null
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          clinica_id: string
          papel: string
          pessoa_id?: string | null
          user_id?: string | null
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          clinica_id?: string
          papel?: string
          pessoa_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sap_papeis_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sap_papeis_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas_equipe"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_pausas: {
        Row: {
          clinica_id: string
          criado_em: string
          criado_por: string | null
          fim: string | null
          id: string
          inicio: string
          motivo: string | null
          removido_em: string | null
          tipo: string
        }
        Insert: {
          clinica_id: string
          criado_em?: string
          criado_por?: string | null
          fim?: string | null
          id?: string
          inicio: string
          motivo?: string | null
          removido_em?: string | null
          tipo: string
        }
        Update: {
          clinica_id?: string
          criado_em?: string
          criado_por?: string | null
          fim?: string | null
          id?: string
          inicio?: string
          motivo?: string | null
          removido_em?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "sap_pausas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_pecas: {
        Row: {
          arquivo_url: string | null
          atualizado_em: string
          campaign_id: string | null
          ciente_em: string | null
          clinica_id: string
          criado_em: string
          criado_por: string | null
          etapa: string
          formato: string
          ganchos: string[]
          id: string
          modelo: string | null
          reprovacao_meta: string | null
          rosto: boolean
          semaforo: string
          status: string
          titulo: string
        }
        Insert: {
          arquivo_url?: string | null
          atualizado_em?: string
          campaign_id?: string | null
          ciente_em?: string | null
          clinica_id: string
          criado_em?: string
          criado_por?: string | null
          etapa: string
          formato: string
          ganchos?: string[]
          id?: string
          modelo?: string | null
          reprovacao_meta?: string | null
          rosto?: boolean
          semaforo?: string
          status?: string
          titulo: string
        }
        Update: {
          arquivo_url?: string | null
          atualizado_em?: string
          campaign_id?: string | null
          ciente_em?: string | null
          clinica_id?: string
          criado_em?: string
          criado_por?: string | null
          etapa?: string
          formato?: string
          ganchos?: string[]
          id?: string
          modelo?: string | null
          reprovacao_meta?: string | null
          rosto?: boolean
          semaforo?: string
          status?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "sap_pecas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_rastreamento_teste: {
        Row: {
          clinica_id: string
          evidencia: string | null
          feito_em: string
          feito_por: string | null
          item: number
          status: string
        }
        Insert: {
          clinica_id: string
          evidencia?: string | null
          feito_em?: string
          feito_por?: string | null
          item: number
          status?: string
        }
        Update: {
          clinica_id?: string
          evidencia?: string | null
          feito_em?: string
          feito_por?: string | null
          item?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sap_rastreamento_teste_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_rotina_semana: {
        Row: {
          atualizado_em: string
          clinica_id: string
          evidencia: string | null
          feito_em: string
          feito_por: string | null
          marco: number
          semana: string
        }
        Insert: {
          atualizado_em?: string
          clinica_id: string
          evidencia?: string | null
          feito_em: string
          feito_por?: string | null
          marco: number
          semana: string
        }
        Update: {
          atualizado_em?: string
          clinica_id?: string
          evidencia?: string | null
          feito_em?: string
          feito_por?: string | null
          marco?: number
          semana?: string
        }
        Relationships: [
          {
            foreignKeyName: "sap_rotina_semana_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_saude_semana: {
        Row: {
          atualizado_em: string
          call_grupo: string | null
          clinica_id: string
          decisor_respondeu: string | null
          kpis_verde: number | null
          kpis_vermelho: number | null
          o_que_aconteceu: string | null
          semana: number
          sentimento: string | null
          sessoes_com_decisor: number | null
          sessoes_marcadas: number | null
          tarefas_no_prazo: number | null
          tempo_resposta_h: number | null
        }
        Insert: {
          atualizado_em?: string
          call_grupo?: string | null
          clinica_id: string
          decisor_respondeu?: string | null
          kpis_verde?: number | null
          kpis_vermelho?: number | null
          o_que_aconteceu?: string | null
          semana: number
          sentimento?: string | null
          sessoes_com_decisor?: number | null
          sessoes_marcadas?: number | null
          tarefas_no_prazo?: number | null
          tempo_resposta_h?: number | null
        }
        Update: {
          atualizado_em?: string
          call_grupo?: string | null
          clinica_id?: string
          decisor_respondeu?: string | null
          kpis_verde?: number | null
          kpis_vermelho?: number | null
          o_que_aconteceu?: string | null
          semana?: number
          sentimento?: string | null
          sessoes_com_decisor?: number | null
          sessoes_marcadas?: number | null
          tarefas_no_prazo?: number | null
          tempo_resposta_h?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sap_saude_semana_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_sessao_registro: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          chave: string
          clinica_id: string
          feito_em: string | null
          sessao: string
          texto: string | null
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave: string
          clinica_id: string
          feito_em?: string | null
          sessao: string
          texto?: string | null
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave?: string
          clinica_id?: string
          feito_em?: string | null
          sessao?: string
          texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sap_sessao_registro_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_tarefa_historico: {
        Row: {
          acao: string
          clinica_id: string
          data: string | null
          em: string
          evidencia: string | null
          id: string
          marco: number
          motivo: string | null
          por: string | null
          semana: string | null
        }
        Insert: {
          acao: string
          clinica_id: string
          data?: string | null
          em?: string
          evidencia?: string | null
          id?: string
          marco: number
          motivo?: string | null
          por?: string | null
          semana?: string | null
        }
        Update: {
          acao?: string
          clinica_id?: string
          data?: string | null
          em?: string
          evidencia?: string | null
          id?: string
          marco?: number
          motivo?: string | null
          por?: string | null
          semana?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sap_tarefa_historico_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_usuario_pref: {
        Row: {
          comece_visto_em: string | null
          tour_visto_em: string | null
          user_id: string
        }
        Insert: {
          comece_visto_em?: string | null
          tour_visto_em?: string | null
          user_id?: string
        }
        Update: {
          comece_visto_em?: string | null
          tour_visto_em?: string | null
          user_id?: string
        }
        Relationships: []
      }
      shortio_cliques_dia: {
        Row: {
          cliques: number
          dia: string
          link_id: string
        }
        Insert: {
          cliques: number
          dia: string
          link_id: string
        }
        Update: {
          cliques?: number
          dia?: string
          link_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shortio_cliques_dia_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "shortio_links"
            referencedColumns: ["id"]
          },
        ]
      }
      shortio_links: {
        Row: {
          atribuicao: string | null
          atribuicao_detalhe: string | null
          atualizado_em: string
          caminho: string | null
          client_id: string | null
          cliques_humanos: number | null
          cliques_total: number | null
          criado_em: string | null
          dominio: string | null
          id: string
          original_url: string | null
          short_url: string | null
          stats_em: string | null
          tags: string[] | null
          titulo: string | null
        }
        Insert: {
          atribuicao?: string | null
          atribuicao_detalhe?: string | null
          atualizado_em?: string
          caminho?: string | null
          client_id?: string | null
          cliques_humanos?: number | null
          cliques_total?: number | null
          criado_em?: string | null
          dominio?: string | null
          id: string
          original_url?: string | null
          short_url?: string | null
          stats_em?: string | null
          tags?: string[] | null
          titulo?: string | null
        }
        Update: {
          atribuicao?: string | null
          atribuicao_detalhe?: string | null
          atualizado_em?: string
          caminho?: string | null
          client_id?: string | null
          cliques_humanos?: number | null
          cliques_total?: number | null
          criado_em?: string | null
          dominio?: string | null
          id?: string
          original_url?: string | null
          short_url?: string | null
          stats_em?: string | null
          tags?: string[] | null
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shortio_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sugestoes_agentes: {
        Row: {
          agente: string
          brain: Json
          campanha_id: string | null
          client_id: string
          conteudo: Json
          conversa_id: string | null
          criado_em: string
          decidido_em: string | null
          decidido_por: string | null
          detalhe: string | null
          estado: string
          evidencias: Json
          execucao_id: string | null
          id: string
          medido_em: string | null
          mensagem: string | null
          prioridade: number
          resultado: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          agente: string
          brain?: Json
          campanha_id?: string | null
          client_id: string
          conteudo?: Json
          conversa_id?: string | null
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          detalhe?: string | null
          estado?: string
          evidencias?: Json
          execucao_id?: string | null
          id?: string
          medido_em?: string | null
          mensagem?: string | null
          prioridade?: number
          resultado?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          agente?: string
          brain?: Json
          campanha_id?: string | null
          client_id?: string
          conteudo?: Json
          conversa_id?: string | null
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          detalhe?: string | null
          estado?: string
          evidencias?: Json
          execucao_id?: string | null
          id?: string
          medido_em?: string | null
          mensagem?: string | null
          prioridade?: number
          resultado?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "sugestoes_agentes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sugestoes_agentes_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sugestoes_agentes_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "agente_execucoes"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_status: {
        Row: {
          client_id: string
          data_ate: string | null
          fonte: string
          last_attempt_at: string | null
          last_error: string | null
          last_rows: number | null
          last_success_at: string | null
          motivo: string | null
          motivo_dono: string | null
          motivo_em: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          data_ate?: string | null
          fonte: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_rows?: number | null
          last_success_at?: string | null
          motivo?: string | null
          motivo_dono?: string | null
          motivo_em?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          data_ate?: string | null
          fonte?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_rows?: number | null
          last_success_at?: string | null
          motivo?: string | null
          motivo_dono?: string | null
          motivo_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_status_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      toques: {
        Row: {
          ad_campaign_id: string | null
          bruto: Json | null
          client_id: string
          criado_em: string
          externo_id: string
          fonte: string
          id: string
          instagram_post_id: string | null
          link_id: string | null
          ocorreu_em: string
          origem_tipo: string | null
          pessoa_id: string | null
          tipo: string
          utm: Json
          valor: number | null
        }
        Insert: {
          ad_campaign_id?: string | null
          bruto?: Json | null
          client_id: string
          criado_em?: string
          externo_id: string
          fonte: string
          id?: string
          instagram_post_id?: string | null
          link_id?: string | null
          ocorreu_em: string
          origem_tipo?: string | null
          pessoa_id?: string | null
          tipo: string
          utm?: Json
          valor?: number | null
        }
        Update: {
          ad_campaign_id?: string | null
          bruto?: Json | null
          client_id?: string
          criado_em?: string
          externo_id?: string
          fonte?: string
          id?: string
          instagram_post_id?: string | null
          link_id?: string | null
          ocorreu_em?: string
          origem_tipo?: string | null
          pessoa_id?: string | null
          tipo?: string
          utm?: Json
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "toques_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toques_instagram_post_id_fkey"
            columns: ["instagram_post_id"]
            isOneToOne: false
            referencedRelation: "instagram_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toques_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links_rastreados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toques_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_precos: {
        Row: {
          atualizado_em: string
          autenticacao_usd: number
          cambio_brl: number
          fonte: string
          id: number
          marketing_usd: number
          taxa_provedor_pct: number
          utilidade_usd: number
        }
        Insert: {
          atualizado_em?: string
          autenticacao_usd?: number
          cambio_brl?: number
          fonte?: string
          id?: number
          marketing_usd?: number
          taxa_provedor_pct?: number
          utilidade_usd?: number
        }
        Update: {
          atualizado_em?: string
          autenticacao_usd?: number
          cambio_brl?: number
          fonte?: string
          id?: number
          marketing_usd?: number
          taxa_provedor_pct?: number
          utilidade_usd?: number
        }
        Relationships: []
      }
      whatsapp_precos_atendimento: {
        Row: {
          id: number
          servico_cobrado_desde: string
          servico_gratis_mes: number
          servico_usd: number
        }
        Insert: {
          id?: number
          servico_cobrado_desde?: string
          servico_gratis_mes?: number
          servico_usd?: number
        }
        Update: {
          id?: number
          servico_cobrado_desde?: string
          servico_gratis_mes?: number
          servico_usd?: number
        }
        Relationships: []
      }
      wts_agents: {
        Row: {
          client_id: string
          email: string | null
          name: string
          profile: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          email?: string | null
          name: string
          profile?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          email?: string | null
          name?: string
          profile?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wts_agents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      wts_departments: {
        Row: {
          client_id: string
          department_id: string
          name: string
          updated_at: string
        }
        Insert: {
          client_id: string
          department_id: string
          name: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          department_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wts_departments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      wts_sessions: {
        Row: {
          channel_id: string | null
          client_id: string
          contact_id: string | null
          created_at: string
          department_id: string | null
          ended_at: string | null
          first_response_at: string | null
          service_seconds: number | null
          session_id: string
          started_at: string
          status: string | null
          updated_at: string
          user_id: string | null
          wait_seconds: number | null
        }
        Insert: {
          channel_id?: string | null
          client_id: string
          contact_id?: string | null
          created_at?: string
          department_id?: string | null
          ended_at?: string | null
          first_response_at?: string | null
          service_seconds?: number | null
          session_id: string
          started_at: string
          status?: string | null
          updated_at?: string
          user_id?: string | null
          wait_seconds?: number | null
        }
        Update: {
          channel_id?: string | null
          client_id?: string
          contact_id?: string | null
          created_at?: string
          department_id?: string | null
          ended_at?: string | null
          first_response_at?: string | null
          service_seconds?: number | null
          session_id?: string
          started_at?: string
          status?: string | null
          updated_at?: string
          user_id?: string | null
          wait_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wts_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      wts_sync_state: {
        Row: {
          client_id: string
          last_session_at: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          last_session_at?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          last_session_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wts_sync_state_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      meta_ads_daily_v: {
        Row: {
          ad_account_id: string | null
          campaign: string | null
          campaign_id: string | null
          clicks: number | null
          client_id: string | null
          conversations: number | null
          cpc: number | null
          cpm: number | null
          ctr: number | null
          custo_por_conversa: number | null
          date: string | null
          frequency: number | null
          impressions: number | null
          landing_page_views: number | null
          leads: number | null
          link_clicks: number | null
          objective: string | null
          reach: number | null
          spend: number | null
          unique_clicks: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_ads_daily_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_funil_semanal: {
        Row: {
          agendamentos: number | null
          clinica_id: string | null
          consultas: number | null
          fechamentos: number | null
          leads: number | null
          mediana_1a_resposta_min: number | null
          qualificados: number | null
          receita: number | null
          semana: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sap_leads_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "sap_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      ads_diagnostico: {
        Args: { p_client_id: string; p_end: string; p_start: string }
        Returns: {
          campaign_id: string
          campanha: string
          cliques_link: number
          conversas: number
          ctr: number
          ctr_antes: number
          ctr_depois: number
          custo_por_conversa: number
          frequencia: number
          gasto: number
          impressoes: number
          motivo: string
          objetivo: string
          permalink: string
          thumbnail_url: string
          veredito: string
        }[]
      }
      ads_por_dia: {
        Args: { p_client_id: string; p_end: string; p_start: string }
        Returns: {
          cliques_link: number
          conversas: number
          dia: string
          gasto: number
          impressoes: number
        }[]
      }
      ads_por_objetivo: {
        Args: { p_client_id: string; p_end: string; p_start: string }
        Returns: {
          campanhas: number
          conversas: number
          ctr: number
          custo_por_conversa: number
          gasto: number
          objetivo: string
        }[]
      }
      ads_resumo: {
        Args: { p_client_id: string; p_end: string; p_start: string }
        Returns: {
          alcance_somado: number
          campanhas: number
          cliques: number
          cliques_link: number
          conversas: number
          cpc: number
          cpm: number
          ctr: number
          custo_por_conversa: number
          dias: number
          gasto: number
          impressoes: number
        }[]
      }
      agentes_controlar: {
        Args: { p_acao: string; p_execucao: string }
        Returns: undefined
      }
      agentes_decidir: {
        Args: { p_aprovacao: string; p_comentario: string; p_decisao: string }
        Returns: undefined
      }
      agentes_iniciar: {
        Args: {
          p_agente: string
          p_client_id: string
          p_fluxo: string
          p_objetivo: string
        }
        Returns: string
      }
      agentes_marcar_marco: {
        Args: {
          p_aprovacao: string
          p_clinica_id: string
          p_evidencia: string
          p_marco: number
        }
        Returns: undefined
      }
      agentes_reservar: {
        Args: { p_execucao: string; p_lease_segundos: number }
        Returns: {
          agente: string
          atualizado_em: string
          client_id: string
          contexto: Json
          criado_em: string
          criado_por: string | null
          custo_usd: number
          encerrado_em: string | null
          erro: string | null
          estado: string
          estado_antes_pausa: string | null
          fluxo: string
          id: string
          lease_ate: string | null
          objetivo: string
          passo_atual: number
          proximo_em: string | null
          resultado: Json | null
          tentativas: number
          teto_custo_usd: number
        }[]
        SetofOptions: {
          from: "*"
          to: "agente_execucoes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      aplicar_contatos_kommo: {
        Args: { p_conn: string; p_linhas: Json }
        Returns: number
      }
      auditoria_comercial: {
        Args: { p_ate: string; p_client: string; p_de: string }
        Returns: Json
      }
      brain_decidir: {
        Args: {
          p_acao: string
          p_comentario?: string
          p_id: string
          p_valor?: string
        }
        Returns: undefined
      }
      brain_manual: {
        Args: {
          p_chave: string
          p_client_id: string
          p_memoria: string
          p_valor: string
        }
        Returns: string
      }
      brain_propor: {
        Args: { p_client_id: string; p_execucao?: string; p_itens: Json }
        Returns: number
      }
      brain_restaurar: { Args: { p_id: string }; Returns: string }
      brain_texto_ok: { Args: { p: string }; Returns: boolean }
      buscar_pessoas: {
        Args: { p_client: string; p_q: string }
        Returns: {
          id: string
          ig_username: string
          nome: string
          origem: string
          telefone_final: string
        }[]
      }
      campanha_ideia_decidir: {
        Args: { p_estado: string; p_id: string; p_resultado?: string }
        Returns: undefined
      }
      campanhas_base: { Args: { p_client_id: string }; Returns: Json }
      chave_telefone: { Args: { p: string }; Returns: string }
      client_fontes: {
        Args: { p_client_id: string }
        Returns: {
          tem_anuncios: boolean
          tem_atendimento: boolean
          tem_crm: boolean
          tem_instagram: boolean
        }[]
      }
      client_sync_status: {
        Args: { p_client_id: string }
        Returns: {
          data_ate: string
          fonte: string
          last_attempt_at: string
          last_error: string
          last_rows: number
          last_success_at: string
          motivo: string
          motivo_dono: string
        }[]
      }
      cobertura_periodo: {
        Args: { p_ate: string; p_client: string; p_de: string }
        Returns: Json
      }
      contas_anuncio_compartilhadas: {
        Args: { p_client_id: string }
        Returns: Json
      }
      conversao_por_origem: {
        Args: { p_ate: string; p_client: string; p_de: string }
        Returns: Json
      }
      conversas_leitura: {
        Args: { p_client: string; p_limite?: number }
        Returns: {
          aguardando_seg: number
          conversa_id: string
          esperas_longas: number
          lead_etapa: string
          lead_resultado: string
          maior_espera_seg: number
          mediana_resposta_comercial_seg: number
          msgs_clinica: number
          msgs_paciente: number
          primeira_resposta_seg: number
          ultima_de: string
          ultima_msg_em: string
          vezes_paciente: number
        }[]
      }
      crm_atividade_recente: {
        Args: { p_client_id: string; p_limit?: number }
        Returns: {
          criado_em: string
          etapa: string
          external_lead_id: string
          fonte: string
          nome: string
          pipeline: string
        }[]
      }
      crm_base_viva: { Args: { p_client_id: string }; Returns: Json }
      crm_definir_etapa_kpi: {
        Args: {
          p_ativo: boolean
          p_connection: string
          p_kpi: string
          p_pipeline: string
          p_status: string
        }
        Returns: undefined
      }
      crm_definir_etapa_resultado: {
        Args: {
          p_connection: string
          p_outcome: string
          p_pipeline: string
          p_status: string
        }
        Returns: number
      }
      crm_diagnostico_comercial: {
        Args: { p_client_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      crm_etapas_kpi_para_analise: {
        Args: { p_client_id: string }
        Returns: {
          connection_id: string
          consulta_agendada: boolean
          em_atendimento: boolean
          origem_atendimento: string
          origem_consulta: string
          padrao_atendimento: boolean
          padrao_consulta: boolean
          pipeline_id: string
          pipeline_name: string
          provider: string
          status_id: string
          status_name: string
          total: number
        }[]
      }
      crm_etapas_para_analise: {
        Args: { p_client_id: string }
        Returns: {
          abertos: number
          confirmado: boolean
          connection_id: string
          ganhos: number
          perdidos: number
          pipeline_id: string
          pipeline_name: string
          provider: string
          resultado_confirmado: string
          status_id: string
          status_name: string
          total: number
          valor: number
        }[]
      }
      crm_funil_por_campo: {
        Args: { p_client_id: string; p_field_name_pattern: string }
        Returns: {
          chave: string
          ganhos: number
          perdidos: number
          total: number
        }[]
      }
      crm_funil_por_campo_periodo: {
        Args: {
          p_client_id: string
          p_field_name_pattern: string
          p_from: string
          p_to: string
        }
        Returns: {
          chave: string
          ganhos: number
          perdidos: number
          total: number
        }[]
      }
      crm_guia_dados: { Args: { p_client_id: string }; Returns: Json }
      crm_leads_por_dia: {
        Args: { p_client_id: string; p_days?: number }
        Returns: {
          dia: string
          total: number
        }[]
      }
      crm_leads_por_dia_periodo: {
        Args: { p_client_id: string; p_from: string; p_to: string }
        Returns: {
          dia: string
          total: number
        }[]
      }
      crm_leads_por_etapa: {
        Args: { p_client_id: string }
        Returns: {
          etapa: string
          pipeline: string
          total: number
        }[]
      }
      crm_leads_resumo_periodo: {
        Args: { p_client_id: string; p_from: string; p_to: string }
        Returns: {
          ganhos: number
          novos: number
          perdidos: number
          valor: number
        }[]
      }
      crm_metricas_essenciais: {
        Args: { p_client_id: string }
        Returns: {
          consultas_agendadas: number
          em_atendimento: number
          em_atendimento_valor: number
          fonte_preenchida_pct: number
          ganhos: number
          novos_7d: number
          perdidos: number
          total_leads: number
        }[]
      }
      crm_pipeline_kanban: {
        Args: { p_client_id: string }
        Returns: {
          pipeline_id: string
          pipeline_name: string
          status_id: string
          status_name: string
          total: number
          valor_total: number
        }[]
      }
      crm_provider: { Args: { p_client_id: string }; Returns: string }
      crm_visoes_comerciais: {
        Args: { p_client_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      custo_whatsapp: {
        Args: { p_ate: string; p_client: string; p_de: string }
        Returns: Json
      }
      definir_ticket_cliente: {
        Args: { p_client: string; p_valor: number }
        Returns: undefined
      }
      experimento_atual: { Args: { p_client: string }; Returns: Json }
      experimento_concluir: {
        Args: { p_descartar?: boolean; p_id: string }
        Returns: undefined
      }
      experimento_iniciar: {
        Args: { p_acao: string; p_client: string; p_falha: string }
        Returns: string
      }
      falha_pct: {
        Args: { p_ate: string; p_client: string; p_de: string; p_falha: string }
        Returns: Json
      }
      is_app_admin: { Args: never; Returns: boolean }
      is_client_member: { Args: { p_client_id: string }; Returns: boolean }
      jornada_funil: {
        Args: { p_ate: string; p_client: string; p_de: string }
        Returns: Json
      }
      jornada_pessoa: { Args: { p_pessoa: string }; Returns: Json }
      jornada_resumo:
        | { Args: { p_client: string }; Returns: Json }
        | {
            Args: { p_ate: string; p_client: string; p_de: string }
            Returns: Json
          }
      kommo_marcar_robo: {
        Args: { p_ate: string; p_client: string; p_de: string }
        Returns: number
      }
      lead_ultima_movimentacao: {
        Args: { p_occurred: string; p_provider: string; p_raw: Json }
        Returns: string
      }
      leitura_conversas: {
        Args: { p_client: string; p_limite?: number }
        Returns: {
          aguardando_seg: number
          atendente: string
          conversa_id: string
          esperas_longas: number
          lead_etapa: string
          lead_resultado: string
          maior_espera_seg: number
          mediana_resposta_comercial_seg: number
          msgs_automaticas: number
          msgs_clinica: number
          msgs_paciente: number
          primeira_resposta_seg: number
          ultima_de: string
          ultima_msg_em: string
          vezes_paciente: number
        }[]
      }
      ler_mensagens: {
        Args: { p_conversa: string }
        Returns: {
          autor: string
          direcao: string
          enviada_em: string
          id: string
          texto: string
          tipo: string
        }[]
      }
      listar_conversas: {
        Args: { p_client: string; p_limite?: number; p_offset?: number }
        Returns: {
          codigo_ref: string
          id: string
          lead_id: string
          pessoa_nome: string
          provider: string
          telefone_final: string
          total_msgs: number
          ultima_msg_em: string
          ultima_msg_texto: string
        }[]
      }
      mensagens_automaticas: { Args: { p_conversa: string }; Returns: string[] }
      origem_texto_salvar: {
        Args: {
          p_apagar?: boolean
          p_client: string
          p_origem: string
          p_padrao: string
          p_rotulo?: string
        }
        Returns: undefined
      }
      pessoas_listar: {
        Args: never
        Returns: {
          ativa: boolean
          client_id: string
          email: string
          funcoes: string[]
          id: string
          nome: string
          observacao: string
          papeis: number
          tem_login: boolean
          tipo: string
          user_id: string
          whatsapp: string
        }[]
      }
      pessoas_salvar: { Args: { p_dados: Json; p_id: string }; Returns: string }
      pode_editar_acoes: { Args: { p_client_id: string }; Returns: boolean }
      qualidade_dados: { Args: { p_client_id: string }; Returns: Json }
      qualidade_leads_campanha: {
        Args: { p_ate: string; p_client: string; p_de: string }
        Returns: Json
      }
      receita_em_jogo: {
        Args: { p_ate: string; p_client: string; p_de: string }
        Returns: Json
      }
      receita_por_canal: {
        Args: { p_ate: string; p_client: string; p_de: string }
        Returns: Json
      }
      roi_periodo: {
        Args: { p_ate: string; p_client_id: string; p_de: string }
        Returns: Json
      }
      sap_atendimento_por_atendente: {
        Args: { p_ate: string; p_client_id: string; p_de: string }
        Returns: Json
      }
      sap_auditoria_ia: {
        Args: { p_client_id: string; p_semana: string }
        Returns: Json
      }
      sap_campanhas_numeros: {
        Args: { p_client_id: string }
        Returns: {
          anteriores7_conversas: number
          anteriores7_gasto: number
          campaign_id: string
          cliques: number
          conversas: number
          dias: number
          gasto: number
          impressoes: number
          nome: string
          objetivo: string
          ultimo_dia: string
          ultimos7_conversas: number
          ultimos7_gasto: number
        }[]
      }
      sap_conferir_rastreamento: {
        Args: { p_clinica_id: string; p_por: string }
        Returns: undefined
      }
      sap_conversoes_lote: {
        Args: { p_limite?: number; p_plataforma: string }
        Returns: Json
      }
      sap_conversoes_reabrir: {
        Args: { p_plataforma: string }
        Returns: undefined
      }
      sap_conversoes_resultado: {
        Args: { p_ids: number[]; p_motivo?: string; p_ok: boolean }
        Returns: undefined
      }
      sap_definir_categoria_motivo: {
        Args: {
          p_categoria: string
          p_connection_id: string
          p_motivo_id: string
        }
        Returns: undefined
      }
      sap_definir_marco: {
        Args: {
          p_connection: string
          p_marco: string
          p_pipeline: string
          p_status: string
        }
        Returns: undefined
      }
      sap_definir_sinal: {
        Args: {
          p_connection_id: string
          p_ligado: boolean
          p_pipeline_id: string
          p_sinal: string
          p_status_id: string
        }
        Returns: undefined
      }
      sap_enfileirar_conversao: {
        Args: { e: Database["public"]["Tables"]["crm_lead_eventos"]["Row"] }
        Returns: undefined
      }
      sap_etapa_neutra: { Args: { p_marco: string }; Returns: string }
      sap_etapas_para_marcar: {
        Args: { p_client_id: string }
        Returns: {
          connection_id: string
          ganhos: number
          marco: string
          perdidos: number
          pipeline_id: string
          pipeline_name: string
          provider: string
          status_id: string
          status_name: string
          sugestao: string
          total: number
        }[]
      }
      sap_fontes_etapas: {
        Args: { p_client_ids: string[] }
        Returns: {
          client_id: string
          marcos: string[]
          tem_anuncios: boolean
          tem_atendimento: boolean
          tem_crm: boolean
        }[]
      }
      sap_item_sem_evidencia: { Args: { p_marco: number }; Returns: boolean }
      sap_leads_atencao: {
        Args: { p_client_id: string; p_limite?: number }
        Returns: Json
      }
      sap_marcar_marco: {
        Args: {
          p_clinica_id: string
          p_concluido_em: string
          p_evidencia: string
          p_marco: number
          p_observacao: string
        }
        Returns: undefined
      }
      sap_marcar_tarefa: {
        Args: {
          p_acao: string
          p_clinica_id: string
          p_data: string
          p_evidencia: string
          p_marco: number
          p_motivo: string
          p_semana?: string
        }
        Returns: undefined
      }
      sap_marcar_visto: { Args: { p_chave: string }; Returns: undefined }
      sap_nome_usuario: { Args: { p_user_id: string }; Returns: string }
      sap_nova_clinica: {
        Args: {
          p_cidade: string
          p_d0: string
          p_especialidade: string
          p_instagram: string
          p_nome: string
          p_piloto: boolean
          p_servico: string
          p_ticket: number
        }
        Returns: string
      }
      sap_papeis_nomes: {
        Args: { p_clinica_ids: string[] }
        Returns: {
          clinica_id: string
          nome: string
          papel: string
          user_id: string
        }[]
      }
      sap_papeis_pessoas: {
        Args: { p_clinica_ids: string[] }
        Returns: {
          clinica_id: string
          nome: string
          papel: string
          pessoa_id: string
          user_id: string
        }[]
      }
      sap_pessoas_hub: {
        Args: never
        Returns: {
          client_ids: string[]
          email: string
          equipe: boolean
          nome: string
          user_id: string
        }[]
      }
      sap_pode_ler: { Args: { p_clinica_id: string }; Returns: boolean }
      sap_registrar_deteccao: {
        Args: {
          p_avaliados: number[]
          p_clinica_id: string
          p_detectados: number[]
        }
        Returns: undefined
      }
      sap_salvar_acao: {
        Args: {
          p_clinica_id: string
          p_codigo: string
          p_id: string
          p_lado: string
          p_origem: string
          p_prazo: string
          p_remover?: boolean
          p_responsavel: string
          p_resultado: string
          p_semana: string
          p_status: string
          p_texto: string
        }
        Returns: string
      }
      sap_salvar_acesso: {
        Args: {
          p_clinica_id: string
          p_confirmado_em: string
          p_confirmado_por: string
          p_item: string
          p_observacao: string
          p_revogado_em: string
          p_status: string
        }
        Returns: undefined
      }
      sap_salvar_atraso: {
        Args: {
          p_categoria: string
          p_clinica_id: string
          p_data: string
          p_descricao: string
          p_dias: number
          p_id: string
          p_remover?: boolean
        }
        Returns: string
      }
      sap_salvar_auditoria: {
        Args: {
          p_clinica_id: string
          p_confirmacao: number
          p_conversas: number
          p_f1: number
          p_nota: number
          p_observacao: string
          p_pensando: number
          p_semana: string
        }
        Returns: undefined
      }
      sap_salvar_clinica: {
        Args: {
          p_client_id: string
          p_d0: string
          p_piloto: boolean
          p_servicos: string[]
          p_status: string
          p_ticket: number
        }
        Returns: string
      }
      sap_salvar_contrato: {
        Args: {
          p_aceite_em: string
          p_aceite_por: string
          p_ajustes: string
          p_clinica_id: string
          p_garantia_inicio: string
          p_garantia_status: string
          p_pos_contrato: string
        }
        Returns: undefined
      }
      sap_salvar_documento_texto: {
        Args: {
          p_clinica_id: string
          p_documento: string
          p_secao: string
          p_texto: string
        }
        Returns: undefined
      }
      sap_salvar_execucao: {
        Args: { p_client_id: string; p_itens: Json }
        Returns: number
      }
      sap_salvar_ficha: {
        Args: {
          p_ambicao: string
          p_caminho: string
          p_categoria_fonte: string
          p_clinica_id: string
          p_coordenador: string
          p_decisor_contato: string
          p_decisor_nome: string
        }
        Returns: undefined
      }
      sap_salvar_fidelizacao: {
        Args: { p_clinica_id: string; p_dados: Json; p_semana: string }
        Returns: undefined
      }
      sap_salvar_papel: {
        Args: { p_clinica_id: string; p_papel: string; p_user_id: string }
        Returns: undefined
      }
      sap_salvar_papel_pessoa: {
        Args: { p_clinica_id: string; p_papel: string; p_pessoa: string }
        Returns: undefined
      }
      sap_salvar_pasta_drive: {
        Args: { p_clinica_id: string; p_url: string }
        Returns: undefined
      }
      sap_salvar_pausa: {
        Args: {
          p_clinica_id: string
          p_fim: string
          p_id: string
          p_inicio: string
          p_motivo: string
          p_remover?: boolean
          p_tipo: string
        }
        Returns: string
      }
      sap_salvar_peca: {
        Args: { p_clinica_id: string; p_dados: Json; p_id: string }
        Returns: string
      }
      sap_salvar_plano: {
        Args: {
          p_baseline_ate: string
          p_baseline_de: string
          p_client_id: string
          p_consulta_paga: boolean
          p_kpis: Json
          p_score_execucao: number
          p_verba_em_dia: boolean
        }
        Returns: undefined
      }
      sap_salvar_rastreamento: {
        Args: { p_clinica_id: string; p_dados: Json }
        Returns: undefined
      }
      sap_salvar_saude: {
        Args: { p_client_id: string; p_semana: Json }
        Returns: undefined
      }
      sap_salvar_sessao: {
        Args: {
          p_chave: string
          p_clinica_id: string
          p_feito: boolean
          p_sessao: string
          p_texto: string
        }
        Returns: undefined
      }
      sap_salvar_teste_rastreamento: {
        Args: {
          p_clinica_id: string
          p_evidencia: string
          p_item: number
          p_status: string
        }
        Returns: undefined
      }
      sap_salvar_verba: {
        Args: {
          p_clinica_id: string
          p_verba_em_dia: boolean
          p_verba_mensal: number
        }
        Returns: undefined
      }
      sap_sinais_auto: {
        Args: { p_client_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      sap_tracker_auto: {
        Args: { p_client_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      sla_sem_resposta: {
        Args: { p_minutos?: number }
        Returns: {
          canal: string
          client_id: string
          cliente: string
          conversa_id: string
          desde: string
          em_horario: boolean
          espera_min: number
          pessoa: string
          provider: string
        }[]
      }
      status_das_fontes: {
        Args: never
        Returns: {
          cadastro: boolean
          client_id: string
          data_ate: string
          fonte: string
          last_attempt_at: string
          last_error: string
          last_success_at: string
          motivo: string
          motivo_dono: string
          nao_usa: boolean
        }[]
      }
      status_fontes_clientes: {
        Args: never
        Returns: {
          cadastro: boolean
          client_id: string
          data_ate: string
          fonte: string
          last_error: string
          motivo: string
          motivo_dono: string
          nao_usa: boolean
        }[]
      }
      sugestao_decidir: {
        Args: { p_estado: string; p_id: string; p_resultado?: string }
        Returns: undefined
      }
      sugestoes_medir: { Args: never; Returns: number }
      suggest_next_angles: {
        Args: { p_client_id: string; p_limit?: number }
        Returns: {
          avg_saved: number
          format: ContentFormat
          funnel_stage: FunnelStage
          methodology_stage: MethodologyStage
          post_count: number
          rationale: string
          tema: string
        }[]
      }
      tem_modulo: {
        Args: { p_client_id: string; p_modulo: string }
        Returns: boolean
      }
      textos_entrada_frequentes: {
        Args: { p_client: string; p_dias?: number }
        Returns: {
          conversas: number
          inicio: string
        }[]
      }
      vincular_flwchat: { Args: { p_client: string }; Returns: number }
      vincular_pessoas: { Args: { p_client: string }; Returns: number }
      wts_por_agente: {
        Args: { p_client_id: string; p_end: string; p_start: string }
        Returns: {
          agente: string
          atendimento_mediano_seg: number
          atendimentos: number
          concluidos: number
          espera_mediana_seg: number
        }[]
      }
      wts_por_departamento: {
        Args: { p_client_id: string; p_end: string; p_start: string }
        Returns: {
          atendimento_mediano_seg: number
          atendimentos: number
          departamento: string
          espera_mediana_seg: number
          fatia: number
        }[]
      }
      wts_resumo: {
        Args: { p_client_id: string; p_end: string; p_start: string }
        Returns: {
          atendimento_cobertura: number
          atendimento_mediano_seg: number
          atendimentos: number
          concluidos: number
          contatos_distintos: number
          em_andamento: number
          espera_cobertura: number
          espera_mediana_seg: number
          sem_roteamento: number
        }[]
      }
      wts_volume_diario: {
        Args: { p_client_id: string; p_end: string; p_start: string }
        Returns: {
          atendimentos: number
          dia: string
          espera_mediana_seg: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
