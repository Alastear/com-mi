"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth-guard";
import { markAllRead } from "./create";

export async function markNotificationsRead(id?: string): Promise<boolean> {
  const session = await getSession();
  if (!session || (id !== undefined && (typeof id !== "string" || id.length < 1 || id.length > 100))) return false;
  await markAllRead(session.user.id, id);
  revalidatePath("/dashboard");
  return true;
}
