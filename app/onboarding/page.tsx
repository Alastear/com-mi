import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth-guard";
import { suggestHandle } from "@/lib/handles";
import { OnboardingClient } from "./onboarding-client";

export const metadata: Metadata = { title: "ตั้งค่าหน้าร้าน / Set up your shop" };

export default async function OnboardingPage() {
  const { user } = await requireSession();

  // ตั้ง handle ไปแล้วก็ไม่ต้องกลับมาหน้านี้อีก
  if (user.handle) redirect("/dashboard");

  return <OnboardingClient suggested={suggestHandle(user.name, user.email)} />;
}
