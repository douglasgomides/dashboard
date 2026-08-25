// Hand-written to match supabase/migrations/20260822000000_fase1_schema.sql.
// Once the project is linked, regenerate with:
//   supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts

export type FunnelStage = "C0" | "C1" | "C2" | "C3";
export type MethodologyStage = "percepcao" | "confianca" | "venda" | "multiplicacao";
export type ContentFormat = "reels" | "carrossel" | "estatico" | "stories";
export type SuggestionStatus = "suggested" | "accepted" | "dismissed";
export type CfmScoreStatus = "verde" | "amarelo" | "vermelho";
export type ClientMemberRole = "owner" | "strategist" | "viewer";
export type CrmProvider = "kommo" | "feegow" | "ninsaude";

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string;
          name: string;
          specialty: string | null;
          instagram_handle: string | null;
          cfm_score_status: CfmScoreStatus | null;
          active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["clients"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["clients"]["Row"]>;
        Relationships: [];
      };
      client_members: {
        Row: {
          id: string;
          client_id: string;
          user_id: string;
          role: ClientMemberRole;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["client_members"]["Row"]> & {
          client_id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["client_members"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "client_members_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      instagram_accounts: {
        Row: {
          id: string;
          client_id: string;
          windsor_account_id: string;
          ig_username: string | null;
          ig_user_id: string | null;
          connected_manually: boolean;
          active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["instagram_accounts"]["Row"]> & {
          client_id: string;
          windsor_account_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["instagram_accounts"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "instagram_accounts_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      instagram_posts: {
        Row: {
          id: string;
          client_id: string;
          instagram_account_id: string;
          windsor_media_id: string;
          media_type: string | null;
          format: ContentFormat | null;
          permalink: string | null;
          thumbnail_url: string | null;
          caption: string | null;
          posted_at: string | null;
          funnel_stage: FunnelStage | null;
          methodology_stage: MethodologyStage | null;
          tema: string | null;
          reach: number | null;
          saved: number | null;
          likes: number | null;
          comments: number | null;
          shares: number | null;
          views: number | null;
          engagement: number | null;
          metrics_updated_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["instagram_posts"]["Row"]> & {
          client_id: string;
          instagram_account_id: string;
          windsor_media_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["instagram_posts"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "instagram_posts_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "instagram_posts_instagram_account_id_fkey";
            columns: ["instagram_account_id"];
            isOneToOne: false;
            referencedRelation: "instagram_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      instagram_account_daily_metrics: {
        Row: {
          id: string;
          client_id: string;
          instagram_account_id: string;
          date: string;
          followers_count: number | null;
          new_followers: number | null;
          reach: number | null;
          likes: number | null;
          comments: number | null;
          saves: number | null;
          shares: number | null;
          total_interactions: number | null;
          profile_links_taps: number | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["instagram_account_daily_metrics"]["Row"]> & {
          client_id: string;
          instagram_account_id: string;
          date: string;
        };
        Update: Partial<Database["public"]["Tables"]["instagram_account_daily_metrics"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "instagram_account_daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "instagram_account_daily_metrics_instagram_account_id_fkey";
            columns: ["instagram_account_id"];
            isOneToOne: false;
            referencedRelation: "instagram_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      content_angle_suggestions: {
        Row: {
          id: string;
          client_id: string;
          tema: string | null;
          funnel_stage: FunnelStage | null;
          methodology_stage: MethodologyStage | null;
          format: ContentFormat | null;
          rationale: string;
          status: SuggestionStatus;
          generated_at: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["content_angle_suggestions"]["Row"]> & {
          client_id: string;
          rationale: string;
        };
        Update: Partial<Database["public"]["Tables"]["content_angle_suggestions"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "content_angle_suggestions_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      app_admins: {
        Row: {
          user_id: string;
          created_at: string;
        };
        Insert: { user_id: string; created_at?: string };
        Update: Partial<{ user_id: string; created_at: string }>;
        Relationships: [];
      };
      crm_connections: {
        Row: {
          id: string;
          client_id: string;
          provider: CrmProvider;
          subdomain: string | null;
          access_token: string | null;
          active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["crm_connections"]["Row"]> & {
          client_id: string;
          provider: CrmProvider;
        };
        Update: Partial<Database["public"]["Tables"]["crm_connections"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "crm_connections_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      inspiration_posts: {
        Row: {
          id: string;
          grupo: string;
          especialidade: string;
          midia: "post" | "reel";
          formato: string | null;
          metrica_valor: number | null;
          metrica_label: string | null;
          multiplicador_mediana: number | null;
          titulo: string | null;
          fonte_url: string | null;
          fonte_handle: string | null;
          gancho: string | null;
          estrutura: string | null;
          por_que_funcionou: string | null;
          como_adaptar: string | null;
          replicabilidade: "alta" | "media" | "baixa" | null;
          replicabilidade_texto: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["inspiration_posts"]["Row"]> & {
          grupo: string;
          especialidade: string;
          midia: "post" | "reel";
        };
        Update: Partial<Database["public"]["Tables"]["inspiration_posts"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_client_member: {
        Args: { p_client_id: string };
        Returns: boolean;
      };
      is_app_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      suggest_next_angles: {
        Args: { p_client_id: string; p_limit?: number };
        Returns: {
          tema: string | null;
          funnel_stage: FunnelStage | null;
          methodology_stage: MethodologyStage | null;
          format: ContentFormat | null;
          avg_saved: number;
          post_count: number;
          rationale: string;
        }[];
      };
    };
  };
}
