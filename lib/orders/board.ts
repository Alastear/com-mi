import { BOARD_COLUMNS, type BoardColumn, type OrderStatus } from "@/lib/types";
import { allowedNext, canTransition } from "./state-machine";

/**
 * กติกาของบอร์ดคิวงาน — ตรรกะล้วน ไม่มี React ไม่มี DB
 *
 * **ทุกอย่างที่นี่คำนวณจาก state machine ห้าม hardcode ตารางการย้ายเอง**
 * ถ้าวันหนึ่งแก้เส้นทางใน state-machine.ts บอร์ดต้องเปลี่ยนตามเองทันที
 * ไม่ใช่ปล่อยให้มีกติกาสองชุดที่ค่อย ๆ เพี้ยนออกจากกัน
 */

/** สถานะไหนไปรวมอยู่คอลัมน์ไหน — คอลัมน์บนบอร์ดน้อยกว่าจำนวนสถานะจริง */
const COLUMN_OF: Record<OrderStatus, BoardColumn | null> = {
  requested: "requested",
  // ครีเอเตอร์เปิดอ่านแล้วแต่ยังไม่ตอบ ยังถือว่าอยู่กองเดียวกับคำขอใหม่
  reviewing: "requested",
  quoted: "quoted",
  accepted: "in_progress",
  in_progress: "in_progress",
  revision_requested: "in_progress",
  in_review: "in_review",
  delivered: "delivered",
  // สถานะปลายทางไม่ขึ้นบอร์ด — ดูได้ในมุมมองรายการ
  completed: null,
  declined: null,
  cancelled: null,
  expired: null,
};

export function columnOf(status: OrderStatus): BoardColumn | null {
  return COLUMN_OF[status];
}

export function isOnBoard(status: OrderStatus): boolean {
  return COLUMN_OF[status] !== null;
}

/**
 * ลากการ์ดจากสถานะนี้ไปลงคอลัมน์นั้น จะกลายเป็นสถานะอะไร (null = ลงไม่ได้)
 *
 * คอลัมน์หนึ่งรับได้หลายสถานะ จึงต้องหาว่าสถานะปลายทางตัวไหนใน คอลัมน์นั้น
 * ที่ครีเอเตอร์เดินไปได้จริง — ไม่ใช่แค่ดูว่าคอลัมน์ต่างกัน
 */
export function boardDropTarget(from: OrderStatus, column: BoardColumn): OrderStatus | null {
  if (COLUMN_OF[from] === column) return null; // ลงคอลัมน์เดิม ไม่ต้องทำอะไร

  const candidates = allowedNext(from, "creator").filter((to) => COLUMN_OF[to] === column);
  return candidates[0] ?? null;
}

/**
 * ปลายทางทั้งหมดที่ครีเอเตอร์กดจากการ์ดใบนี้ได้ — ใช้กับเมนู "ย้ายไป…"
 *
 * เมนูนี้สำคัญกว่าที่คิด: การย้ายสามแบบ (requested→reviewing, accepted→in_progress,
 * revision_requested→in_progress) เกิดขึ้นภายในคอลัมน์เดียวกัน ลากไม่ได้เลย
 * ถ้ามีแต่ drag-and-drop ครีเอเตอร์จะทำสามอย่างนี้ไม่ได้ทั้งที่เป็นงานประจำวัน
 * และเมนูยังเป็นทางเดียวที่ใช้คีย์บอร์ดหรือมือถือได้
 */
export function boardMenuTargets(from: OrderStatus): OrderStatus[] {
  return allowedNext(from, "creator");
}

/** คอลัมน์ที่ลากไปลงได้จากสถานะนี้ — ใช้ไฮไลต์ช่องที่รับของตอนเริ่มลาก */
export function droppableColumns(from: OrderStatus): BoardColumn[] {
  return BOARD_COLUMNS.filter((c) => boardDropTarget(from, c) !== null);
}

export { canTransition };
