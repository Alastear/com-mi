ALTER TABLE "media" ADD COLUMN "order_id" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "is_watermarked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "media_order_kind_idx" ON "media" USING btree ("order_id","kind");--> statement-breakpoint
-- FK เขียนมือ: schema/order.ts import media จาก schema/app.ts อยู่แล้ว
-- ถ้าใส่ .references() กลับทางจะเป็น circular import ระหว่างสอง module
-- SET NULL ไม่ใช่ CASCADE — แถวใน media ต้องอยู่ต่อให้ cron เก็บกวาดไฟล์ใน Blob ได้
-- ถ้าลบตามไปเลย จะเหลือไฟล์ค้างใน store ที่ไม่มีใครรู้ว่าเป็นของใครและลบไม่ได้อีก
ALTER TABLE "media" ADD CONSTRAINT "media_order_id_order_id_fk"
  FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE SET NULL;
