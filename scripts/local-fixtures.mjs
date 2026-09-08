// Fictional LOCAL fixtures. Never provision these accounts in a hosted project.
export const password = "Codeedge-local-only-123!";
export const businesses = [
  { id: "30000000-0000-4000-8000-000000000001", name: "Northfield Plumbing", slug: "northfield-plumbing" },
  { id: "30000000-0000-4000-8000-000000000002", name: "Westbrook Electrical", slug: "westbrook-electrical" },
];
export const accounts = [
  { email: "alice@codeedge.test", business: 0, role: "owner", status: "active" },
  { email: "bob@codeedge.test", business: 1, role: "owner", status: "active" },
  { email: "staff@codeedge.test", business: 0, role: "staff", status: "active" },
  { email: "revoked@codeedge.test", business: 0, role: "staff", status: "revoked" },
];
