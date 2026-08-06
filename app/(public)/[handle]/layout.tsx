import { notFound } from "next/navigation";
import { shopExists } from "@/lib/queries/creator";

/**
 * ตัดสินว่า handle นี้มีอยู่จริงไหม — ต้องทำ "ที่ layout" ไม่ใช่ที่ page
 *
 * เหตุผลเดิมยังใช้อยู่: ถ้ามี `loading.tsx` ที่ segment นี้ Next จะเริ่ม stream ทันที
 * header 200 จึงถูกส่งออกไปก่อน `notFound()` → ได้ soft-404 ที่ Google จะ index
 * (docs/01-architecture.md §2)
 *
 * query ตัวนี้ตั้งใจให้เบาที่สุด — เช็คแค่ว่ามี user ที่ถือ handle นี้ไหม ไม่ join อะไร
 */
export default async function CreatorLayout({
  params,
  children,
}: {
  params: Promise<{ handle: string }>;
  children: React.ReactNode;
}) {
  const { handle } = await params;
  if (!(await shopExists(handle))) notFound();

  return children;
}
