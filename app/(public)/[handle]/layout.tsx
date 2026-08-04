import { notFound } from "next/navigation";
import { getCreator } from "@/lib/mock/data";

/**
 * ตัดสินว่า handle นี้มีอยู่จริงไหม — ต้องทำ "ที่ layout" ไม่ใช่ที่ page
 *
 * เหตุผล: `loading.tsx` ของ segment นี้ทำให้ Next เริ่ม stream response ทันที
 * header 200 จึงถูกส่งออกไปก่อนที่ page จะได้เรียก `notFound()` ผลคือได้ soft-404
 * (เนื้อหาเป็นหน้า 404 แต่สถานะเป็น 200) ซึ่ง Google จะ index หน้าที่ไม่มีอยู่จริง
 *
 * layout รันจบก่อน Suspense fallback ถูกส่งออก → `notFound()` ที่นี่ให้สถานะ 404 จริง
 * และยังคงได้ skeleton ระหว่างรอข้อมูลของ page ตามเดิม
 *
 * ตอนต่อ DB จริง: ให้ layout และ page เรียก query ตัวเดียวกันที่ครอบด้วย 'use cache'
 * → lookup ซ้ำไม่มีต้นทุนเพิ่ม (docs/01-architecture.md §2)
 */
export default async function CreatorLayout({
  params,
  children,
}: {
  params: Promise<{ handle: string }>;
  children: React.ReactNode;
}) {
  const { handle } = await params;
  if (!getCreator(handle)) notFound();

  return children;
}
