import type { ApiScope } from "@/lib/api/v1/scopes";

export type Credential = {
  id: string;
  name: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
};

export type Client = {
  id: string;
  name: string;
  status: "ACTIVE" | "DISABLED";
  scopes: ApiScope[];
  credentials: Credential[];
};

export function expiryIso(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  return raw ? new Date(raw).toISOString() : null;
}

export function formatTimestamp(value: string) {
  // Minute precision; stored times usually carry milliseconds ("…:18.356Z").
  return `${new Date(value).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
