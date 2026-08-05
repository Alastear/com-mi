"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { Auth } from "@/lib/auth";

/**
 * `inferAdditionalFields` ทำให้ฝั่ง client รู้จัก handle / plan / planUntil / role
 * ที่เพิ่มไว้ใน additionalFields โดยไม่ต้องประกาศชนิดซ้ำ
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>()],
});

export const { signIn, signOut, useSession } = authClient;
