import { notFound } from "next/navigation";
import { shopExists } from "@/lib/queries/creator";
import { normalizeHandle } from "@/lib/handles";

/**
 * ตัดสินว่า handle นี้มีอยู่จริงไหม — ต้องทำ "ที่ layout" ไม่ใช่ที่ page
 *
 * เหตุผลเดิมยังใช้อยู่: ถ้ามี `loading.tsx` ที่ segment นี้ Next จะเริ่ม stream ทันที
 * header 200 จึงถูกส่งออกไปก่อน `notFound()` → ได้ soft-404 ที่ Google จะ index
 * (docs/01-architecture.md §2)
 *
 * ส่วนการเด้งไป URL ตามหลัก (`/@handle`) ทำที่ **page** ไม่ใช่ที่นี่ —
 * layout ไม่รู้ path ของลูก ถ้าเด้งจากตรงนี้ `/somchai/s/ภาพครึ่งตัว`
 * จะถูกส่งไป `/@somchai` เฉย ๆ แล้วเมนูที่ลูกค้าตั้งใจเปิดหายไปทั้งอัน
 */
export default async function CreatorLayout({
  params,
  children,
}: {
  params: Promise<{ handle: string }>;
  children: React.ReactNode;
}) {
  const { handle } = await params;
  if (!(await shopExists(normalizeHandle(handle)))) notFound();
  return children;
}
