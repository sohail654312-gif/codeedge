import "server-only";
import { z } from "zod";
import type { QueryClient } from "@/server/db/query";
import { loadBrainContext } from "./context";
import { DeterministicProvider, type AiProvider, type BrainInput } from "./provider";

export const fallback = "I don't have confirmed information to answer that. You can leave your name, a phone number or email, and an enquiry for this business. Please avoid sensitive information.";
const selection = z.object({ factKeys: z.array(z.string().max(40)).max(7), nextStep: z.enum(["none", "enquiry"]) }).strict();
export async function answerFromContext(input: BrainInput, provider: AiProvider, timeoutMs = 3000): Promise<string> {
  const controller = new AbortController();
  const approved = new Map(input.knowledge.facts.map((fact) => [fact.key, fact.text]));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      provider.selectFacts(input, controller.signal),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Provider timeout")); }, timeoutMs); }),
    ]);
    const parsed = selection.parse(result);
    if (parsed.factKeys.some((key) => !approved.has(key))) return fallback;
    const selected = [...new Set(parsed.factKeys)].map((key) => approved.get(key)!);
    if (!selected.length) return fallback;
    // Only server-loaded approved text can reach the visitor. The provider cannot
    // append unverified prices, promises, prompts or customer data.
    const answer = selected.join("\n\n") + (parsed.nextStep === "enquiry" ? "\n\nYou can leave an enquiry with this business." : "");
    return answer.length <= 4000 ? answer : fallback;
  } catch { return fallback; }
  finally { if (timer) clearTimeout(timer); controller.abort(); }
}
export async function generateReply(db: QueryClient, conversationId: string, provider: AiProvider = new DeterministicProvider()) {
  const input = await loadBrainContext(db, conversationId);
  return answerFromContext(input, provider);
}
