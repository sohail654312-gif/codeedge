import "server-only";
import { z } from "zod";
import type { QueryClient } from "@/server/db/query";
import { instructions, type BrainInput, type Fact } from "./provider";

type Row = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" ? value : "";
export async function loadBrainContext(db: QueryClient, conversationId: string): Promise<BrainInput> {
  z.uuid().parse(conversationId);
  // The calling channel must establish its restricted DB capability first. RLS
  // revalidates that capability here; neither tenant nor history comes from input.
  const session = (await db.query<{ business_id: string }>("select business_id from public.conversations where id=$1", [conversationId])).rows[0];
  if (!session) throw new Error("Conversation unavailable");
  const businessId = session.business_id;
  const one = async (sql: string) => (await db.query(sql, [businessId])).rows[0];
  const business = await one("select name,timezone from public.businesses where id=$1");
  if (!business) throw new Error("Business unavailable");
  const facts: Fact[] = []; let remaining = 16000;
  const add = (kind: Fact["kind"], label: string, content: string) => {
    const clean = content.trim();
    // Omit oversized facts rather than silently changing their meaning by clipping.
    if (!clean || clean.length > 4000 || clean.length + label.length > remaining) return;
    remaining -= clean.length + label.length;
    facts.push({ key: `fact_${facts.length}`, kind, label: label.slice(0, 300), text: clean });
  };
  const profile = await one("select trading_name,phone,email,website,address,description,category from public.business_profiles where business_id=$1");
  add("profile", "Business", `Business: ${text(business.name)}`);
  if (profile) for (const [field, label] of Object.entries({ trading_name: "Trading name", phone: "Phone", email: "Email", website: "Website", address: "Address", description: "About", category: "Category" })) {
    if (text(profile[field])) add("profile", label, `${label}: ${text(profile[field])}`);
  }
  const services = (await db.query("select name,description,starting_price_pence,quote_required from public.services where business_id=$1 and active order by display_order,id limit 30", [businessId])).rows;
  for (const service of services) {
    const price = typeof service.starting_price_pence === "number" ? ` Starting price: £${(service.starting_price_pence / 100).toFixed(2)}.` : " No confirmed starting price is listed.";
    add("service", text(service.name), `${text(service.name)}: ${text(service.description)}${price}${service.quote_required ? " A quote is required." : ""}`);
  }
  const areas = (await db.query("select name,postcode,notes from public.service_areas where business_id=$1 and active order by display_order,id limit 30", [businessId])).rows;
  for (const area of areas) add("area", text(area.name), `Service area: ${text(area.name)} ${text(area.postcode)}. ${text(area.notes)}`);
  const hours = (await db.query("select weekday,is_closed,opens_at,closes_at from public.opening_hours where business_id=$1 order by weekday limit 7", [businessId])).rows;
  const days = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  for (const day of hours) {
    const name = days[Number(day.weekday)] ?? "Day";
    add("hours", name, `${name}: ${day.is_closed ? "closed" : `${text(day.opens_at).slice(0, 5)}–${text(day.closes_at).slice(0, 5)}`} (${text(business.timezone)}).`);
  }
  const faqs = (await db.query("select question,answer from public.business_faqs where business_id=$1 and is_active order by display_order,id limit 30", [businessId])).rows;
  for (const faq of faqs) add("faq", text(faq.question), text(faq.answer));
  // Private notification email/preferences are deliberately not provider context.
  const settings = await one("select locale from public.business_settings where business_id=$1");
  const recent = (await db.query<Row>("select sender,content from public.messages where business_id=$1 and conversation_id=$2 order by created_at desc,id desc limit 20", [businessId, conversationId])).rows;
  let historyBudget = 12000;
  const history: BrainInput["history"] = [];
  for (const message of recent) {
    const content = text(message.content);
    if (content.length > historyBudget) break;
    if (message.sender !== "visitor" && message.sender !== "assistant") continue;
    historyBudget -= content.length;
    history.unshift({ sender: message.sender, content });
  }
  return { instructions, knowledge: { name: text(business.name), timezone: text(business.timezone), locale: text(settings?.locale) || "en-GB", facts }, history };
}
