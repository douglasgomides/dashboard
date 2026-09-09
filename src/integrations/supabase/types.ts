export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type FunnelStage = "C0" | "C1" | "C2" | "C3";
export type MethodologyStage = "percepcao" | "confianca" | "venda" | "multiplicacao";
export type ContentFormat = "reels" | "carrossel" | "estatico" | "stories";
export type SuggestionStatus = "suggested" | "accepted" | "dismissed";
export type CfmScoreStatus = "verde" | "amarelo" | "vermelho";
export type ClientMemberRole = "owner" | "strategist" | "viewer";
export type CrmProvider = "kommo" | "feegow" | "ninsaude" | "clint";

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
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
      clients: {
        Row: {
          active: boolean
          avatar_url: string | null
          cfm_score_status: CfmScoreStatus | null
          created_at: string
          id: string
          instagram_handle: string | null
          meta_ad_account_id: string | null
          name: string
          specialty: string | null
          wts_company_id: string | null
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          cfm_score_status?: CfmScoreStatus | null
          created_at?: string
          id?: string
          instagram_handle?: string | null
          meta_ad_account_id?: string | null
          name: string
          specialty?: string | null
          wts_company_id?: string | null
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          cfm_score_status?: CfmScoreStatus | null
          created_at?: string
          id?: string
          instagram_handle?: string | null
          meta_ad_account_id?: string | null
          name?: string
          specialty?: string | null
          wts_company_id?: string | null
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
      crm_connections: {
        Row: {
          access_token: string | null
          active: boolean
          client_id: string
          created_at: string
          id: string
          config: Json
          provider: CrmProvider
          subdomain: string | null
          webhook_secret: string | null
        }
        Insert: {
          access_token?: string | null
          active?: boolean
          client_id: string
          created_at?: string
          id?: string
          config?: Json
          provider: CrmProvider
          subdomain?: string | null
          webhook_secret?: string | null
        }
        Update: {
          access_token?: string | null
          active?: boolean
          client_id?: string
          created_at?: string
          id?: string
          config?: Json
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
      crm_leads: {
        Row: {
          client_id: string
          crm_connection_id: string
          event_type: string
          external_lead_id: string
          id: string
          old_status_id: string | null
          pipeline_id: string | null
          price: number | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          occurred_at: string | null
          outcome: string | null
          source: string | null
          provider: CrmProvider
          raw_payload: Json
          received_at: string
          removido_na_origem: string | null
          status_id: string | null
        }
        Insert: {
          client_id: string
          crm_connection_id: string
          event_type: string
          external_lead_id: string
          id?: string
          old_status_id?: string | null
          pipeline_id?: string | null
          price?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          occurred_at?: string | null
          outcome?: string | null
          source?: string | null
          provider: CrmProvider
          raw_payload: Json
          received_at?: string
          removido_na_origem?: string | null
          status_id?: string | null
        }
        Update: {
          client_id?: string
          crm_connection_id?: string
          event_type?: string
          external_lead_id?: string
          id?: string
          old_status_id?: string | null
          pipeline_id?: string | null
          price?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          occurred_at?: string | null
          outcome?: string | null
          source?: string | null
          provider?: CrmProvider
          raw_payload?: Json
          received_at?: string
          removido_na_origem?: string | null
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
        Relationships: []
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
          sync_source?: string
          ig_username?: string | null
          windsor_account_id: string
        }
        Update: {
          active?: boolean
          client_id?: string
          connected_manually?: boolean
          created_at?: string
          id?: string
          ig_user_id?: string | null
          sync_source?: string
          ig_username?: string | null
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
          media_type: string | null
          methodology_stage: MethodologyStage | null
          metrics_updated_at: string | null
          permalink: string | null
          posted_at: string | null
          media_follows: number | null
          profile_visits: number | null
          reel_avg_watch_time_ms: number | null
          reel_skip_rate: number | null
          reel_total_watch_time_ms: number | null
          reach: number | null
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
          media_type?: string | null
          methodology_stage?: MethodologyStage | null
          metrics_updated_at?: string | null
          permalink?: string | null
          posted_at?: string | null
          media_follows?: number | null
          profile_visits?: number | null
          reel_avg_watch_time_ms?: number | null
          reel_skip_rate?: number | null
          reel_total_watch_time_ms?: number | null
          reach?: number | null
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
          media_type?: string | null
          methodology_stage?: MethodologyStage | null
          metrics_updated_at?: string | null
          permalink?: string | null
          posted_at?: string | null
          media_follows?: number | null
          profile_visits?: number | null
          reel_avg_watch_time_ms?: number | null
          reel_skip_rate?: number | null
          reel_total_watch_time_ms?: number | null
          reach?: number | null
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
      meta_ads_campaigns: {
        Row: {
          ad_account_id: string
          campaign_id: string
          client_id: string
          instagram_media_id: string | null
          name: string
          objective: string | null
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
          client_id: string
          clicks: number
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
          client_id: string
          clicks?: number
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
          client_id?: string
          clicks?: number
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ads_diagnostico: {
        Args: { p_client_id: string; p_end: string; p_start: string }
        Returns: {
          campaign_id: string
          campanha: string
          cliques_link: number
          conversas: number
          ctr: number | null
          ctr_antes: number | null
          ctr_depois: number | null
          custo_por_conversa: number | null
          frequencia: number | null
          gasto: number
          impressoes: number
          motivo: string
          objetivo: string | null
          permalink: string | null
          thumbnail_url: string | null
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
          ctr: number | null
          custo_por_conversa: number | null
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
          cpc: number | null
          cpm: number | null
          ctr: number | null
          custo_por_conversa: number | null
          dias: number
          gasto: number
          impressoes: number
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
      crm_funil_por_campo: {
        Args: { p_client_id: string; p_field_name_pattern: string }
        Returns: {
          chave: string
          ganhos: number
          perdidos: number
          total: number
        }[]
      }
      crm_leads_por_dia: {
        Args: { p_client_id: string; p_days?: number }
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
      is_app_admin: { Args: never; Returns: boolean }
      is_client_member: { Args: { p_client_id: string }; Returns: boolean }
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
    Enums: {},
  },
} as const
