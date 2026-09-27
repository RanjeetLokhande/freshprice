// Generated from the Supabase schema (Supabase MCP generate_typescript_types).
// Regenerate after every migration; do not edit by hand.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          data_type: string
          description: string | null
          key: string
          label: string
          options: Json | null
          sort_order: number
          updated_at: string
          value: Json
          version: number
        }
        Insert: {
          data_type: string
          description?: string | null
          key: string
          label: string
          options?: Json | null
          sort_order?: number
          updated_at?: string
          value: Json
          version?: number
        }
        Update: {
          data_type?: string
          description?: string | null
          key?: string
          label?: string
          options?: Json | null
          sort_order?: number
          updated_at?: string
          value?: Json
          version?: number
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity: string
          entity_id: string | null
          id: number
          new_data: Json | null
          old_data: Json | null
          request_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          request_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          request_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      calculation_items: {
        Row: {
          amount: number
          calculation_id: number
          category_name_snapshot: string | null
          created_at: string
          id: number
          item_id: number
          item_name_snapshot: string
          line_no: number
          normalized_quantity: number
          price: number
          price_id: number | null
          price_unit_id: number
          price_unit_symbol_snapshot: string
          quantity: number
          unit_id: number
          unit_symbol_snapshot: string
          updated_at: string
        }
        Insert: {
          amount: number
          calculation_id: number
          category_name_snapshot?: string | null
          created_at?: string
          id?: never
          item_id: number
          item_name_snapshot: string
          line_no: number
          normalized_quantity: number
          price: number
          price_id?: number | null
          price_unit_id: number
          price_unit_symbol_snapshot: string
          quantity: number
          unit_id: number
          unit_symbol_snapshot: string
          updated_at?: string
        }
        Update: {
          amount?: number
          calculation_id?: number
          category_name_snapshot?: string | null
          created_at?: string
          id?: never
          item_id?: number
          item_name_snapshot?: string
          line_no?: number
          normalized_quantity?: number
          price?: number
          price_id?: number | null
          price_unit_id?: number
          price_unit_symbol_snapshot?: string
          quantity?: number
          unit_id?: number
          unit_symbol_snapshot?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calculation_items_calculation_id_fkey"
            columns: ["calculation_id"]
            isOneToOne: false
            referencedRelation: "calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculation_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculation_items_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "item_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculation_items_price_unit_id_fkey"
            columns: ["price_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculation_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      calculations: {
        Row: {
          adjustment: number
          calculation_date: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string
          finalized_at: string | null
          finalized_by: string | null
          grand_total: number
          id: number
          idempotency_key: string | null
          notes: string | null
          reference_number: string
          status: Database["public"]["Enums"]["calculation_status"]
          subtotal: number
          updated_at: string
          version: number
        }
        Insert: {
          adjustment?: number
          calculation_date: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          finalized_at?: string | null
          finalized_by?: string | null
          grand_total?: number
          id?: never
          idempotency_key?: string | null
          notes?: string | null
          reference_number: string
          status?: Database["public"]["Enums"]["calculation_status"]
          subtotal?: number
          updated_at?: string
          version?: number
        }
        Update: {
          adjustment?: number
          calculation_date?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          finalized_at?: string | null
          finalized_by?: string | null
          grand_total?: number
          id?: never
          idempotency_key?: string | null
          notes?: string | null
          reference_number?: string
          status?: Database["public"]["Enums"]["calculation_status"]
          subtotal?: number
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          id: number
          name: string
          parent_id: number | null
          sort_order: number
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: never
          name: string
          parent_id?: number | null
          sort_order?: number
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: never
          name?: string
          parent_id?: number | null
          sort_order?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      field_definitions: {
        Row: {
          active: boolean
          created_at: string
          data_type: string
          entity: string
          form_order: number
          help_text: string | null
          id: number
          key: string
          label: string
          list_order: number
          lookup_entity: string | null
          max_value: number | null
          min_value: number | null
          mobile_visible: boolean
          options: Json | null
          pattern: string | null
          required: boolean
          show_in_form: boolean
          show_in_list: boolean
          sort_order: number
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          data_type: string
          entity: string
          form_order?: number
          help_text?: string | null
          id?: never
          key: string
          label: string
          list_order?: number
          lookup_entity?: string | null
          max_value?: number | null
          min_value?: number | null
          mobile_visible?: boolean
          options?: Json | null
          pattern?: string | null
          required?: boolean
          show_in_form?: boolean
          show_in_list?: boolean
          sort_order?: number
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          data_type?: string
          entity?: string
          form_order?: number
          help_text?: string | null
          id?: never
          key?: string
          label?: string
          list_order?: number
          lookup_entity?: string | null
          max_value?: number | null
          min_value?: number | null
          mobile_visible?: boolean
          options?: Json | null
          pattern?: string | null
          required?: boolean
          show_in_form?: boolean
          show_in_list?: boolean
          sort_order?: number
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      idempotency_keys: {
        Row: {
          created_at: string
          endpoint: string
          key: string
          response: Json
          status_code: number
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          key: string
          response: Json
          status_code: number
          user_id?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          key?: string
          response?: Json
          status_code?: number
          user_id?: string
        }
        Relationships: []
      }
      item_price_revisions: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: number
          new_price: number
          old_price: number
          price_id: number
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_price: number
          old_price: number
          price_id: number
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_price?: number
          old_price?: number
          price_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "item_price_revisions_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "item_prices"
            referencedColumns: ["id"]
          },
        ]
      }
      item_prices: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          item_id: number
          notes: string | null
          price: number
          price_date: string
          unit_id: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: never
          item_id: number
          notes?: string | null
          price: number
          price_date: string
          unit_id: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: never
          item_id?: number
          notes?: string | null
          price?: number
          price_date?: string
          unit_id?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "item_prices_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_prices_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      item_unit_conversions: {
        Row: {
          active: boolean
          created_at: string
          factor: number
          from_unit_id: number
          id: number
          item_id: number
          sort_order: number
          to_unit_id: number
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          factor: number
          from_unit_id: number
          id?: never
          item_id: number
          sort_order?: number
          to_unit_id: number
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          factor?: number
          from_unit_id?: number
          id?: never
          item_id?: number
          sort_order?: number
          to_unit_id?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "item_unit_conversions_from_unit_id_fkey"
            columns: ["from_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_unit_conversions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_unit_conversions_to_unit_id_fkey"
            columns: ["to_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          active: boolean
          attributes: Json
          category_id: number
          created_at: string
          default_unit_id: number
          deleted_at: string | null
          id: number
          name: string
          pricing_unit_id: number
          sort_order: number
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          attributes?: Json
          category_id: number
          created_at?: string
          default_unit_id: number
          deleted_at?: string | null
          id?: never
          name: string
          pricing_unit_id: number
          sort_order?: number
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          attributes?: Json
          category_id?: number
          created_at?: string
          default_unit_id?: number
          deleted_at?: string | null
          id?: never
          name?: string
          pricing_unit_id?: number
          sort_order?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_default_unit_id_fkey"
            columns: ["default_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_pricing_unit_id_fkey"
            columns: ["pricing_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          description: string
          key: string
        }
        Insert: {
          description: string
          key: string
        }
        Update: {
          description?: string
          key?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          full_name: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission_key: string
          role_id: number
        }
        Insert: {
          permission_key: string
          role_id: number
        }
        Update: {
          permission_key?: string
          role_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          active: boolean
          created_at: string
          id: number
          key: string
          name: string
          sort_order: number
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: never
          key: string
          name: string
          sort_order?: number
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: never
          key?: string
          name?: string
          sort_order?: number
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      unit_types: {
        Row: {
          active: boolean
          created_at: string
          id: number
          key: string
          name: string
          sort_order: number
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: never
          key: string
          name: string
          sort_order?: number
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: never
          key?: string
          name?: string
          sort_order?: number
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      units: {
        Row: {
          active: boolean
          base_unit_id: number | null
          conversion_factor: number
          created_at: string
          decimal_precision: number
          id: number
          name: string
          sort_order: number
          symbol: string
          unit_type_id: number
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          base_unit_id?: number | null
          conversion_factor?: number
          created_at?: string
          decimal_precision?: number
          id?: never
          name: string
          sort_order?: number
          symbol: string
          unit_type_id: number
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          base_unit_id?: number | null
          conversion_factor?: number
          created_at?: string
          decimal_precision?: number
          id?: never
          name?: string
          sort_order?: number
          symbol?: string
          unit_type_id?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "units_base_unit_id_fkey"
            columns: ["base_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_unit_type_id_fkey"
            columns: ["unit_type_id"]
            isOneToOne: false
            referencedRelation: "unit_types"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          role_id: number
          user_id: string
        }
        Insert: {
          role_id: number
          user_id: string
        }
        Update: {
          role_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_calculation: {
        Args: { p_id: number; p_version: number; p_reason: string }
        Returns: undefined
      }
      active_admin_count: { Args: never; Returns: number }
      dashboard_stats: { Args: { p_date: string }; Returns: Json }
      set_user_roles: { Args: { p_user_id: string; p_role_keys: string[] }; Returns: undefined }
      finalize_calculation: { Args: { p_id: number; p_version: number }; Returns: undefined }
      report_daily_totals: {
        Args: { p_from: string; p_to: string }
        Returns: { day: string; calculations: number; lines: number; total: number }[]
      }
      report_item_summary: {
        Args: { p_from: string; p_to: string }
        Returns: {
          item_id: number
          item_name: string
          category_name: string | null
          unit_symbol: string
          quantity: number
          amount: number
          avg_rate: number | null
          lines: number
          calculations: number
        }[]
      }
      has_permission: { Args: { p_key: string }; Returns: boolean }
      latest_prices_before: {
        Args: { p_date: string }
        Returns: { item_id: number; unit_id: number; price_date: string; price: number }[]
      }
      my_permissions: { Args: never; Returns: string[] }
      save_calculation: {
        Args: {
          p_id: number | null
          p_version: number | null
          p_date: string
          p_notes: string | null
          p_adjustment: number
          p_lines: Json
          p_finalize?: boolean
          p_idempotency_key?: string | null
        }
        Returns: Json
      }
      upsert_prices: {
        Args: { p_date: string; p_rows: Json; p_atomic?: boolean }
        Returns: Json
      }
    }
    Enums: {
      calculation_status: "draft" | "finalized" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export const Constants = {
  public: {
    Enums: {
      calculation_status: ["draft", "finalized", "cancelled"],
    },
  },
} as const
