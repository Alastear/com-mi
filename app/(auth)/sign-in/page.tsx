import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-guard";
import { SignInClient } from "./sign-in-client";

export const metadata: Metadata = { title: "เข้าสู่ระบบ / Sign in" };

export default async function SignInPage() {
  // ล็อกอินอยู่แล้วก็ไม่ต้องเห็นหน้านี้
  if (await getSession()) redirect("/dashboard");

  // useSearchParams ต้องอยู่ใน Suspense ไม่งั้นทั้งหน้าถูกบังคับเป็น CSR
  return (
    <Suspense>
      <SignInClient />
    </Suspense>
  );
}
