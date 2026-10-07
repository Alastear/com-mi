"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { RolloutInput } from "./rollout-policy";
import { rolloutMutationSql } from "./rollout-sql";

export async function updateRollout(input: unknown) {
  const session = await requireAdmin();
  const parsed = RolloutInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" } as const;
  const v = parsed.data;
  const rows = await getDb().execute<{ version: number }>(rolloutMutationSql(v, session.user.id, newId("audit")));
  if (!rows.rows.length) return { ok: false, error: "conflict" } as const;
  revalidatePath("/admin/rollouts");
  revalidatePath("/clients", "layout");
  return { ok: true, version: rows.rows[0].version } as const;
}
