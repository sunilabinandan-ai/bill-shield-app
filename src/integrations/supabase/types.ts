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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      bills: {
        Row: {
          bill_period: string | null
          calculated_total: number
          created_at: string
          file_path: string
          id: string
          provider: string
          total_on_bill: number | null
          user_id: string
        }
        Insert: {
          bill_period?: string | null
          calculated_total: number
          created_at?: string
          file_path: string
          id?: string
          provider: string
          total_on_bill?: number | null
          user_id: string
        }
        Update: {
          bill_period?: string | null
          calculated_total?: number
          created_at?: string
          file_path?: string
          id?: string
          provider?: string
          total_on_bill?: number | null
          user_id?: string
        }
        Relationships: []
      }
      line_items: {
        Row: {
          amount: number
          bill_id: string
          flag: string
          id: string
          label: string
          note: string | null
          user_id: string
        }
        Insert: {
          amount: number
          bill_id: string
          flag: string
          id?: string
          label: string
          note?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          bill_id?: string
          flag?: string
          id?: string
          label?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "line_items_bill_id_user_id_fkey"
            columns: ["bill_id", "user_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      messages: {
        Row: {
          created_at: string
          edited_text: string | null
          id: string
          line_item_id: string | null
          message_text: string
          sent: boolean
          sent_at: string | null
          user_id: string
          words_changed: number
        }
        Insert: {
          created_at?: string
          edited_text?: string | null
          id?: string
          line_item_id?: string | null
          message_text: string
          sent?: boolean
          sent_at?: string | null
          user_id: string
          words_changed?: number
        }
        Update: {
          created_at?: string
          edited_text?: string | null
          id?: string
          line_item_id?: string | null
          message_text?: string
          sent?: boolean
          sent_at?: string | null
          user_id?: string
          words_changed?: number
        }
        Relationships: [
          {
            foreignKeyName: "messages_line_item_id_user_id_fkey"
            columns: ["line_item_id", "user_id"]
            isOneToOne: false
            referencedRelation: "line_items"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      promises: {
        Row: {
          created_at: string
          id: string
          promise_text: string
          promised_price: number | null
          provider: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          promise_text: string
          promised_price?: number | null
          provider: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          promise_text?: string
          promised_price?: number | null
          provider?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      save_bill_check: { Args: { payload: Json }; Returns: Json }
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
