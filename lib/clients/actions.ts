"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { CapabilityAccessError } from "@/lib/capabilities/authorize";
import { ownClientScope } from "./queries";
import { ClientProfileInput } from "./profile";
import { saveClientProfileSql } from "./profile-sql";

export async function saveClientProfile(input: unknown): Promise<{ ok: true; version: number } | { ok: false; error: "invalid" | "denied" | "conflict" }> {
  const parsed = ClientProfileInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  let scope;
  try { scope = await ownClientScope(); }
  catch (error) { if (error instanceof CapabilityAccessError) return { ok: false, error: "denied" }; throw error; }
  if (!scope) return { ok: false, error: "denied" };
  const v = parsed.data;
  const result = await getDb().execute<{ version: number }>(saveClientProfileSql(scope, v));
  if (!result.rows.length) return { ok: false, error: "conflict" };
  revalidatePath("/clients");
  revalidatePath(`/clients/${v.clientId}`);
  return { ok: true, version: result.rows[0].version };
}
