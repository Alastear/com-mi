"use client";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/client";

export default function ClientsError({ reset }: { reset: () => void }) {
  const { locale } = useLocale();
  const th = locale === "th";
  return <div role="alert" className="mx-auto w-full max-w-4xl space-y-4 px-4 py-8"><h2 className="font-semibold">{th ? "โหลดข้อมูลลูกค้าไม่สำเร็จ" : "Could not load client data"}</h2><p className="text-sm text-muted-foreground">{th ? "ลองโหลดอีกครั้ง ข้อมูลเดิมยังอยู่ในระบบ" : "Please try again. Your existing data has not changed."}</p><Button onClick={reset}>{th ? "ลองอีกครั้ง" : "Try again"}</Button></div>;
}
