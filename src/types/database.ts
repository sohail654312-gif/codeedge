// Schema-aligned types for migration 20260908000100_foundation.sql.
// Replace with reviewed `npm run db:types` output when a local Supabase stack is available.
export type Role = "owner" | "staff";
export type BusinessStatus = "active" | "suspended";
export type MembershipStatus = "active" | "revoked";
export type Business = { id: string; name: string; slug: string; status: BusinessStatus; timezone: string; created_at: string; updated_at: string };
export type Membership = { business_id: string; user_id: string; role: Role; status: MembershipStatus; created_at: string; updated_at: string };
export type Profile = { id: string; display_name: string; created_at: string; updated_at: string };

type Table<Row, Insert, Update> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };
export type Database = {
  public: {
    Tables: {
      businesses: Table<Business, { name: string; slug: string; id?: string; status?: BusinessStatus; timezone?: string }, { name?: string }>;
      business_memberships: Table<Membership, { business_id: string; user_id: string; role: Role; status?: MembershipStatus }, { role?: Role; status?: MembershipStatus }>;
      profiles: Table<Profile, { id: string; display_name?: string }, { display_name?: string }>;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { business_role: Role; business_status: BusinessStatus; membership_status: MembershipStatus };
    CompositeTypes: { [_ in never]: never };
  };
};
