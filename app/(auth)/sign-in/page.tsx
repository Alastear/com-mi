import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-guard";
import { SignInClient } from "./sign-in-client";

export const metadata: Metadata = { title: "เข้าสู่ระบบ / Sign in" };

export default async function SignInPage() {
  /**
   * ล็อกอินอยู่แล้วก็ไม่ต้องเห็นหน้านี้ — กลับหน้าแรก ไม่ใช่หลังบ้าน
   * หน้าแรกคือหน้าหาครีเอเตอร์ ซึ่งใช้ได้กับทุกคน ส่วน /dashboard ต้องมีร้านก่อน
   */
  if (await getSession()) redirect("/");

  // useSearchParams ต้องอยู่ใน Suspense ไม่งั้นทั้งหน้าถูกบังคับเป็น CSR
  return (
    <Suspense>
      <SignInClient />
    </Suspense>
  );
}
