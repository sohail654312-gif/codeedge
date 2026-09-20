/** Minimal server-side query boundary shared by trusted channel adapters. */
export type QueryClient = { query: <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> };
