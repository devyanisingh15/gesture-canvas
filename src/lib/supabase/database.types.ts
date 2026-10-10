/**
 * Database types for the Supabase client, in the shape `supabase gen types
 * typescript` produces. Written by hand from supabase/migrations; regenerate
 * with `npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts`
 * once the CLI is linked to the project.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export const GAME_STATUSES = [
  "LOBBY",
  "STARTING",
  "WHEEL_SPINNING",
  "TARGET_REVEALED",
  "DRAWING",
  "TIME_UP",
  "EVALUATING",
  "ROUND_RESULTS",
  "FINAL_RESULTS",
  "COMPLETED",
] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export const ROUND_STATUSES = ["SPINNING", "REVEALED", "DRAWING", "TIME_UP", "EVALUATING", "COMPLETED"] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];

export interface Database {
  public: {
    Tables: {
      games: {
        Row: {
          id: string;
          room_code: string;
          status: GameStatus;
          current_round: number;
          total_rounds: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_code: string;
          status?: GameStatus;
          current_round?: number;
          total_rounds?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["games"]["Insert"]>;
        Relationships: [];
      };
      players: {
        // user_id exists but players can't select it, so it isn't in Row.
        Row: {
          id: string;
          game_id: string;
          display_name: string;
          is_host: boolean;
          joined_at: string;
          last_seen_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          user_id?: string;
          display_name: string;
          is_host?: boolean;
          joined_at?: string;
          last_seen_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["players"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "players_game_id_fkey"; columns: ["game_id"]; isOneToOne: false; referencedRelation: "games"; referencedColumns: ["id"] },
        ];
      };
      rounds: {
        Row: {
          id: string;
          game_id: string;
          round_number: number;
          prompt: string;
          status: RoundStatus;
          started_at: string;
          ends_at: string | null;
        };
        Insert: {
          id?: string;
          game_id: string;
          round_number: number;
          prompt: string;
          status?: RoundStatus;
          started_at?: string;
          ends_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["rounds"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "rounds_game_id_fkey"; columns: ["game_id"]; isOneToOne: false; referencedRelation: "games"; referencedColumns: ["id"] },
        ];
      };
      drawings: {
        Row: { id: string; round_id: string; player_id: string; strokes: Json; submitted_at: string };
        Insert: { id?: string; round_id: string; player_id: string; strokes: Json; submitted_at?: string };
        Update: Partial<Database["public"]["Tables"]["drawings"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "drawings_round_id_fkey"; columns: ["round_id"]; isOneToOne: false; referencedRelation: "rounds"; referencedColumns: ["id"] },
          { foreignKeyName: "drawings_player_id_fkey"; columns: ["player_id"]; isOneToOne: false; referencedRelation: "players"; referencedColumns: ["id"] },
        ];
      };
      scores: {
        Row: { id: string; round_id: string; player_id: string; score: number; created_at: string };
        Insert: { id?: string; round_id: string; player_id: string; score: number; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["scores"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "scores_round_id_fkey"; columns: ["round_id"]; isOneToOne: false; referencedRelation: "rounds"; referencedColumns: ["id"] },
          { foreignKeyName: "scores_player_id_fkey"; columns: ["player_id"]; isOneToOne: false; referencedRelation: "players"; referencedColumns: ["id"] },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_game: {
        Args: { p_display_name: string; p_total_rounds?: number };
        Returns: { game_id: string; player_id: string; room_code: string }[];
      };
      join_game: {
        Args: { p_room_code: string; p_display_name: string };
        Returns: { game_id: string; player_id: string; room_code: string }[];
      };
      touch_seat: {
        Args: { p_game_id: string };
        Returns: undefined;
      };
      leave_game: {
        Args: { p_game_id: string };
        Returns: undefined;
      };
      start_game: {
        Args: { p_game_id: string };
        Returns: string;
      };
      find_open_lobby: {
        Args: { p_room_code: string };
        Returns: string | null;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
