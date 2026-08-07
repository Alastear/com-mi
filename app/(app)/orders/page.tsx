import { OrderBoard } from "@/components/app/order-board";
import { requireCreator } from "@/lib/auth-guard";
import { listOrdersForBoard } from "@/lib/queries/orders";
import { getLocale } from "@/lib/i18n/server";
import { ensureShop } from "@/lib/shop/ensure";
import type { OrderStatus } from "@/lib/types";

export default async function OrdersPage() {
  const locale = await getLocale();
  const { user } = await requireCreator();
  await ensureShop(user.id, user.name, locale);

  const rows = await listOrdersForBoard(user.id);

  /**
   * แบนเป็น DTO แบน ๆ ก่อนส่งข้ามไปฝั่ง client
   *
   * ส่งแถวดิบจาก Drizzle ไปตรง ๆ จะพก object ซ้อนและฟิลด์ที่บอร์ดไม่ได้ใช้ข้ามไปด้วย
   * ทั้งที่ต้อง serialize ทุกฟิลด์ลง payload ของหน้า
   *
   * ชื่องานเอาจาก order_item ที่แช่ไว้ตอนสั่ง ไม่ใช่ service.title ปัจจุบัน —
   * ครีเอเตอร์เปลี่ยนชื่อเมนูทีหลังแล้วออเดอร์เก่าต้องยังอ่านเหมือนเดิม
   */
  const orders = rows.map((o) => ({
    id: o.id,
    code: o.code,
    status: o.status as OrderStatus,
    title: o.items[0]?.label ?? o.service?.title ?? "",
    clientName: o.client?.name ?? "",
    clientImage: o.client?.image ?? null,
    currency: o.currency,
    totalCents: o.totalCents,
    amountPaidCents: o.amountPaidCents,
    dueAt: o.dueAt ? o.dueAt.toISOString() : null,
    createdAt: o.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:py-8">
      <OrderBoard orders={orders} />
    </div>
  );
}
