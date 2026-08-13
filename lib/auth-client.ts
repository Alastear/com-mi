"use client";

import { createAuthClient } from "better-auth/react";
import { emailOTPClient, inferAdditionalFields } from "better-auth/client/plugins";
import type { Auth } from "@/lib/auth";

/**
 * `inferAdditionalFields` ทำให้ฝั่ง client รู้จัก handle / plan / planUntil / role
 * ที่เพิ่มไว้ใน additionalFields โดยไม่ต้องประกาศชนิดซ้ำ
 */
export const authClient = createAuthClient({
  /**
   * `emailOTPClient` ใส่ไว้เสมอถึงแม้ฝั่ง server จะปิดอยู่ตอนยังไม่มีโดเมน
   * มันแค่เพิ่มเมธอดให้เรียก ถ้า endpoint ปิดอยู่ก็ได้ 404 กลับมาตามปกติ —
   * ทำให้ไม่ต้องมีสองเวอร์ชันของ client ที่ต้องคอยสลับตาม env
   */
  plugins: [inferAdditionalFields<Auth>(), emailOTPClient()],
});

export const { signIn, signUp, signOut, useSession, emailOtp } = authClient;
