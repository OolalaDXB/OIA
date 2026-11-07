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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          dedup_hash: string
          detail: string
          headline: string
          id: string
          kind: Database["public"]["Enums"]["alert_kind"]
          next_action: string
          opportunity_id: string | null
          project_slug: string | null
          severity: number
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          dedup_hash: string
          detail?: string
          headline: string
          id?: string
          kind: Database["public"]["Enums"]["alert_kind"]
          next_action?: string
          opportunity_id?: string | null
          project_slug?: string | null
          severity?: number
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          dedup_hash?: string
          detail?: string
          headline?: string
          id?: string
          kind?: Database["public"]["Enums"]["alert_kind"]
          next_action?: string
          opportunity_id?: string | null
          project_slug?: string | null
          severity?: number
        }
        Relationships: [
          {
            foreignKeyName: "alerts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "watch_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          actor: string
          at: string
          email: string | null
          id: string
          name: string
          note: string | null
          organisation: string | null
          phone: string | null
          project_slug: string | null
          record_id: string | null
          role: string | null
        }
        Insert: {
          actor: string
          at?: string
          email?: string | null
          id?: string
          name: string
          note?: string | null
          organisation?: string | null
          phone?: string | null
          project_slug?: string | null
          record_id?: string | null
          role?: string | null
        }
        Update: {
          actor?: string
          at?: string
          email?: string | null
          id?: string
          name?: string
          note?: string | null
          organisation?: string | null
          phone?: string | null
          project_slug?: string | null
          record_id?: string | null
          role?: string | null
        }
        Relationships: []
      }
      link_checks: {
        Row: {
          checked_at: string
          final_url: string | null
          http_code: number | null
          note: string
          status: string
          url: string
          where_found: string[]
        }
        Insert: {
          checked_at: string
          final_url?: string | null
          http_code?: number | null
          note?: string
          status: string
          url: string
          where_found?: string[]
        }
        Update: {
          checked_at?: string
          final_url?: string | null
          http_code?: number | null
          note?: string
          status?: string
          url?: string
          where_found?: string[]
        }
        Relationships: []
      }
      notes: {
        Row: {
          actor: string
          at: string
          id: string
          project_slug: string | null
          record_id: string | null
          text: string
        }
        Insert: {
          actor: string
          at?: string
          id?: string
          project_slug?: string | null
          record_id?: string | null
          text: string
        }
        Update: {
          actor?: string
          at?: string
          id?: string
          project_slug?: string | null
          record_id?: string | null
          text?: string
        }
        Relationships: []
      }
      project_drafts: {
        Row: {
          applied_at: string | null
          applied_commit: string | null
          created_at: string
          created_by: string
          entry: Json
          error: string | null
          slug: string
          status: string
        }
        Insert: {
          applied_at?: string | null
          applied_commit?: string | null
          created_at?: string
          created_by?: string
          entry: Json
          error?: string | null
          slug: string
          status?: string
        }
        Update: {
          applied_at?: string | null
          applied_commit?: string | null
          created_at?: string
          created_by?: string
          entry?: Json
          error?: string | null
          slug?: string
          status?: string
        }
        Relationships: []
      }
      project_tags: {
        Row: {
          actor: string
          at: string
          project_slug: string
          record_id: string
        }
        Insert: {
          actor: string
          at?: string
          project_slug: string
          record_id: string
        }
        Update: {
          actor?: string
          at?: string
          project_slug?: string
          record_id?: string
        }
        Relationships: []
      }
      requests: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          kind: Database["public"]["Enums"]["request_kind"]
          payload: Json
          requested_at: string
          requested_by: string
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["request_status"]
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["request_kind"]
          payload?: Json
          requested_at?: string
          requested_by?: string
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["request_status"]
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["request_kind"]
          payload?: Json
          requested_at?: string
          requested_by?: string
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["request_status"]
        }
        Relationships: []
      }
      reviews: {
        Row: {
          action: string
          actor: string
          at: string
          comment: string
          gate_pursue_eligible_at_decision: boolean
          id: string
          record_id: string
        }
        Insert: {
          action: string
          actor: string
          at?: string
          comment?: string
          gate_pursue_eligible_at_decision: boolean
          id?: string
          record_id: string
        }
        Update: {
          action?: string
          actor?: string
          at?: string
          comment?: string
          gate_pursue_eligible_at_decision?: boolean
          id?: string
          record_id?: string
        }
        Relationships: []
      }
      saved_views: {
        Row: {
          created_at: string
          filters: Json
          id: string
          kind: string
          name: string
          sort_direction: string
          sort_field: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          kind?: string
          name: string
          sort_direction?: string
          sort_field?: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          kind?: string
          name?: string
          sort_direction?: string
          sort_field?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          actor: string
          at: string
          completed_at: string | null
          due: string | null
          id: string
          project_slug: string | null
          record_id: string | null
          status: string
          title: string
        }
        Insert: {
          actor: string
          at?: string
          completed_at?: string | null
          due?: string | null
          id?: string
          project_slug?: string | null
          record_id?: string | null
          status?: string
          title: string
        }
        Update: {
          actor?: string
          at?: string
          completed_at?: string | null
          due?: string | null
          id?: string
          project_slug?: string | null
          record_id?: string | null
          status?: string
          title?: string
        }
        Relationships: []
      }
      watch_events: {
        Row: {
          at: string
          detail: Json
          event_type: Database["public"]["Enums"]["watch_event_type"]
          id: number
          opportunity_id: string
          run_id: string | null
        }
        Insert: {
          at?: string
          detail?: Json
          event_type: Database["public"]["Enums"]["watch_event_type"]
          id?: number
          opportunity_id: string
          run_id?: string | null
        }
        Update: {
          at?: string
          detail?: Json
          event_type?: Database["public"]["Enums"]["watch_event_type"]
          id?: number
          opportunity_id?: string
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watch_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "watch_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_opportunities: {
        Row: {
          content_fingerprint: string
          deadline_at: string | null
          disappeared_at: string | null
          discovered_for: string[]
          first_seen_at: string
          gate_failed_reasons: string[]
          gate_pursue_eligible: boolean
          id: string
          info_confidence: number
          issuer: string
          last_seen_at: string
          official_url: string | null
          opportunity_kind: string | null
          payload: Json
          recommendation: string
          record_id: string
          times_seen: number
          title: string
          verification_status: string
          watch_key: string
        }
        Insert: {
          content_fingerprint: string
          deadline_at?: string | null
          disappeared_at?: string | null
          discovered_for?: string[]
          first_seen_at?: string
          gate_failed_reasons?: string[]
          gate_pursue_eligible?: boolean
          id?: string
          info_confidence?: number
          issuer: string
          last_seen_at?: string
          official_url?: string | null
          opportunity_kind?: string | null
          payload: Json
          recommendation: string
          record_id: string
          times_seen?: number
          title: string
          verification_status: string
          watch_key: string
        }
        Update: {
          content_fingerprint?: string
          deadline_at?: string | null
          disappeared_at?: string | null
          discovered_for?: string[]
          first_seen_at?: string
          gate_failed_reasons?: string[]
          gate_pursue_eligible?: boolean
          id?: string
          info_confidence?: number
          issuer?: string
          last_seen_at?: string
          official_url?: string | null
          opportunity_kind?: string | null
          payload?: Json
          recommendation?: string
          record_id?: string
          times_seen?: number
          title?: string
          verification_status?: string
          watch_key?: string
        }
        Relationships: []
      }
      watch_runs: {
        Row: {
          disappeared_count: number
          finished_at: string | null
          id: string
          new_count: number
          projects: string[]
          records_seen: number
          report: Json
          source: string
          started_at: string
          updated_count: number
        }
        Insert: {
          disappeared_count?: number
          finished_at?: string | null
          id?: string
          new_count?: number
          projects?: string[]
          records_seen?: number
          report?: Json
          source: string
          started_at?: string
          updated_count?: number
        }
        Update: {
          disappeared_count?: number
          finished_at?: string | null
          id?: string
          new_count?: number
          projects?: string[]
          records_seen?: number
          report?: Json
          source?: string
          started_at?: string
          updated_count?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      alert_kind:
        | "NEW_MATCH"
        | "CLOSING_SOON"
        | "JUST_EXPIRED"
        | "DEADLINE_CHANGED"
        | "DISAPPEARED"
        | "APPROVED_BUT_BLOCKED"
      request_kind: "DISCOVERY" | "INGEST_URL" | "LINK_CHECK"
      request_status: "QUEUED" | "RUNNING" | "DONE" | "FAILED"
      watch_event_type:
        | "DISCOVERED"
        | "UPDATED"
        | "DEADLINE_SET"
        | "DEADLINE_CHANGED"
        | "RECOMMENDATION_CHANGED"
        | "VERIFICATION_CHANGED"
        | "DISAPPEARED"
        | "REAPPEARED"
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
    Enums: {
      alert_kind: [
        "NEW_MATCH",
        "CLOSING_SOON",
        "JUST_EXPIRED",
        "DEADLINE_CHANGED",
        "DISAPPEARED",
        "APPROVED_BUT_BLOCKED",
      ],
      request_kind: ["DISCOVERY", "INGEST_URL", "LINK_CHECK"],
      request_status: ["QUEUED", "RUNNING", "DONE", "FAILED"],
      watch_event_type: [
        "DISCOVERED",
        "UPDATED",
        "DEADLINE_SET",
        "DEADLINE_CHANGED",
        "RECOMMENDATION_CHANGED",
        "VERIFICATION_CHANGED",
        "DISAPPEARED",
        "REAPPEARED",
      ],
    },
  },
} as const
