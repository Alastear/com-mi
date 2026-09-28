import { sql, type SQL } from "drizzle-orm";
import { schema } from "@/lib/db";
import type { OrderStatus } from "@/lib/types";

/**
 * `moneyBlock()` ในรูป SQL — ใส่ใน WHERE ของ UPDATE ที่เปลี่ยนสถานะออเดอร์
 *
 * ทำไมเช็คใน JS อย่างเดียวไม่พอ: อ่านยอดก่อนแล้วค่อยเขียน ระหว่างนั้น `voidPayment()`
 * (ยกเลิกการยืนยัน) ลดยอดที่จ่ายลงได้ ถ้า WHERE มีแค่ status เดิม ออเดอร์จะเข้า
 * `in_progress` ทั้งที่มัดจำไม่ถึง หรือเข้า `delivered` ทั้งที่จ่ายไม่ครบ
 * ใส่เงื่อนไขเงินไว้ใน WHERE แล้ว Postgres เช็คกับแถวล่าสุดตอนเขียนเอง — ถ้า batch
 * ของ voidPayment ล็อกแถวออเดอร์อยู่ UPDATE นี้จะรอ แล้วเช็ค WHERE ใหม่กับค่าที่ commit แล้ว
 *
 * ⚠️ ต้องตรงกับ `canRelease()` / `depositSatisfied()` ใน release.ts ทุกเงื่อนไข
 * แยกไฟล์ไว้เพราะ release.ts ต้องไม่ดึงโค้ดฐานข้อมูลตามไปด้วย
 *
 * คืน undefined เมื่อปลายทางไม่มีเงื่อนไขเงิน — `and()` ของ drizzle ข้ามให้เอง
 */
export function moneyGateSql(to: OrderStatus): SQL | undefined {
  const o = schema.order;
  if (to === "in_progress") {
    return sql`(${o.depositCents} = 0 or ${o.amountPaidCents} >= ${o.depositCents})`;
  }
  if (to === "delivered") {
    return sql`(${o.totalCents} > 0 and ${o.amountPaidCents} >= ${o.totalCents})`;
  }
  return undefined;
}
