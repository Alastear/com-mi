"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth-guard";
import { markAllRead } from "./create";

export async function markNotificationsRead(): Promise<void> {
  const session = await getSession();
  if (!session) return;
  await markAllRead(session.user.id);
  revalidatePath("/dashboard");
}
