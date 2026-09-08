// Schema-aligned types for the Phase 1 and Phase 2A migrations.
// Replace with reviewed `npm run db:types` output when a local Supabase stack is available.
export type Role = "owner" | "staff";
export type BusinessStatus = "active" | "suspended";
export type MembershipStatus = "active" | "revoked";
export type Business = { id: string; name: string; slug: string; status: BusinessStatus; timezone: string; created_at: string; updated_at: string };
export type Membership = { business_id: string; user_id: string; role: Role; status: MembershipStatus; created_at: string; updated_at: string };
export type Profile = { id: string; display_name: string; created_at: string; updated_at: string };

type Table<Row, Insert, Update> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };
export type BusinessProfileFields = { trading_name: string; phone: string; email: string; website: string; address: string; description: string; category: string; logo_alt: string };
export type BusinessProfile = BusinessProfileFields & { business_id: string; created_at: string; updated_at: string };
export type ServiceFields = { name: string; description: string; active: boolean; starting_price_pence: number | null; quote_required: boolean; display_order: number };
export type Service = ServiceFields & { id: string; business_id: string; created_at: string; updated_at: string };
export type Database = {
  public: {
    Tables: {
      business_profiles: Table<BusinessProfile, BusinessProfileFields & { business_id: string }, Partial<BusinessProfileFields>>;
      services: Table<Service, ServiceFields & { business_id: string }, Partial<ServiceFields>>;
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
