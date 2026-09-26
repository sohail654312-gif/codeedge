// Schema-aligned types through the current migrations.
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
export type ServiceAreaFields = { name: string; postcode: string; notes: string; active: boolean; display_order: number };
export type ServiceArea = ServiceAreaFields & { id: string; business_id: string; created_at: string; updated_at: string };
export type OpeningHoursFields = { is_closed: boolean; opens_at: string | null; closes_at: string | null };
export type OpeningHours = OpeningHoursFields & { business_id: string; weekday: number; created_at: string; updated_at: string };
export type BusinessFaqFields = { question: string; answer: string; is_active: boolean; display_order: number };
export type BusinessFaq = BusinessFaqFields & { id: string; business_id: string; created_at: string; updated_at: string };
export type BusinessSettingsFields = { locale: string; lead_notification_email: string; notify_new_leads: boolean };
export type BusinessSettings = BusinessSettingsFields & { business_id: string; created_at: string; updated_at: string };
export type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost";
export type QuoteRequestStatus = "requested" | "reviewing" | "quoted" | "declined";
export type LeadFields = { contact_name: string; phone: string; email: string; source: string; service_id: string | null; enquiry_summary: string; status: LeadStatus };
export type Lead = LeadFields & { id: string; business_id: string; created_by: string | null; created_at: string; updated_at: string };
export type LeadNoteFields = { body: string };
export type LeadNote = LeadNoteFields & { id: string; business_id: string; lead_id: string; created_by: string | null; created_at: string; updated_at: string };
export type QuoteRequestFields = { details: string; status: QuoteRequestStatus };
export type QuoteRequest = QuoteRequestFields & { id: string; business_id: string; lead_id: string; created_by: string | null; created_at: string; updated_at: string };
export type ConversationHandling = "ai" | "human";
export type ConversationChannel = "web_chat" | "whatsapp";
export type WhatsAppOutboxStatus = "pending" | "sent" | "failed";
export type Database = {
  public: {
    Tables: {
      platform_operators: Table<{ user_id: string; status: "active" | "revoked"; created_at: string; updated_at: string }, never, never>;
      admin_audit_events: Table<{ id: string; business_id: string | null; actor_user_id: string | null; actor_scope: "owner" | "operator" | "system"; action: string; target_type: string; target_id: string | null; result: "success" | "denied" | "failed"; metadata: Record<string, unknown>; created_at: string }, never, never>;
      chat_widgets: Table<{ id: string; business_id: string; enabled: boolean }, { business_id: string; enabled: boolean }, { enabled?: boolean }>;
      conversations: Table<{ id: string; business_id: string; widget_id: string | null; channel: ConversationChannel; lead_id: string | null; handling_mode: ConversationHandling; assigned_to: string | null; taken_over_by: string | null; taken_over_at: string | null; created_at: string; updated_at: string; expires_at: string | null }, never, never>;
      messages: Table<{ id: string; business_id: string; conversation_id: string; sender: "visitor" | "assistant" | "member"; content: string; request_id: string; created_by: string | null; created_at: string }, never, never>;
      whatsapp_channels: Table<{ id: string; business_id: string; phone_number_id: string; business_account_id: string; display_phone_number: string; enabled: boolean; created_at: string; updated_at: string }, never, never>;
      whatsapp_threads: Table<{ id: string; business_id: string; channel_id: string; wa_contact_id: string; conversation_id: string; profile_name: string; created_at: string; updated_at: string }, never, never>;
      whatsapp_inbound_events: Table<{ provider_message_id: string; business_id: string; channel_id: string; conversation_id: string; received_at: string }, never, never>;
      whatsapp_outbox: Table<{ id: string; business_id: string; channel_id: string; conversation_id: string; message_id: string; recipient_id: string; body: string; source_event_id: string | null; status: WhatsAppOutboxStatus; provider_message_id: string | null; attempt_count: number; last_error: string | null; created_at: string; updated_at: string }, never, never>;
      quote_requests: Table<QuoteRequest, QuoteRequestFields & { business_id: string; lead_id: string; created_by: string }, Partial<QuoteRequestFields>>;
      lead_notes: Table<LeadNote, LeadNoteFields & { business_id: string; lead_id: string; created_by: string }, Partial<LeadNoteFields>>;
      leads: Table<Lead, LeadFields & { business_id: string; created_by: string }, Partial<LeadFields>>;
      business_settings: Table<BusinessSettings, BusinessSettingsFields & { business_id: string }, Partial<BusinessSettingsFields>>;
      business_faqs: Table<BusinessFaq, BusinessFaqFields & { business_id: string }, Partial<BusinessFaqFields>>;
      service_areas: Table<ServiceArea, ServiceAreaFields & { business_id: string }, Partial<ServiceAreaFields>>;
      opening_hours: Table<OpeningHours, OpeningHoursFields & { business_id: string; weekday: number }, Partial<OpeningHoursFields>>;
      business_profiles: Table<BusinessProfile, BusinessProfileFields & { business_id: string }, Partial<BusinessProfileFields>>;
      services: Table<Service, ServiceFields & { business_id: string }, Partial<ServiceFields>>;
      businesses: Table<Business, { name: string; slug: string; id?: string; status?: BusinessStatus; timezone?: string }, { name?: string }>;
      business_memberships: Table<Membership, { business_id: string; user_id: string; role: Role; status?: MembershipStatus }, { role?: Role; status?: MembershipStatus }>;
      profiles: Table<Profile, { id: string; display_name?: string }, { display_name?: string }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      list_business_memberships: { Args: { target_business: string }; Returns: { user_id: string; email: string | null; display_name: string | null; role: Role; status: MembershipStatus; created_at: string }[] };
      revoke_staff_membership: { Args: { target_business: string; target_user: string }; Returns: undefined };
      operator_list_businesses: { Args: Record<PropertyKey, never>; Returns: { id: string; name: string; slug: string; status: BusinessStatus; active_members: number }[] };
      operator_list_memberships: { Args: { target_business: string }; Returns: { user_id: string; email: string | null; role: Role; status: MembershipStatus; created_at: string }[] };
      operator_provision_business: { Args: { target_name: string; target_slug: string; target_user: string }; Returns: string };
      operator_activate_staff: { Args: { target_business: string; target_user: string }; Returns: undefined };
      operator_revoke_staff: { Args: { target_business: string; target_user: string }; Returns: undefined };
      handoff_take_over: { Args: { target_conversation: string; target_assignee?: string | null }; Returns: undefined };
      handoff_resume_ai: { Args: { target_conversation: string }; Returns: undefined };
      handoff_reply: { Args: { target_conversation: string; body: string; target_request: string }; Returns: { outboxId: string | null; phoneNumberId: string | null } };
    };
    Enums: { business_role: Role; business_status: BusinessStatus; membership_status: MembershipStatus; lead_status: LeadStatus; quote_request_status: QuoteRequestStatus; conversation_handling: ConversationHandling };
    CompositeTypes: { [_ in never]: never };
  };
};
