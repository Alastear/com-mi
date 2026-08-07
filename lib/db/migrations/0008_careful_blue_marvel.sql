CREATE TABLE "delivery_issuance" (
	"id" text PRIMARY KEY NOT NULL,
	"delivery_id" text NOT NULL,
	"media_id" text NOT NULL,
	"user_id" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "filename" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_issuance" ADD CONSTRAINT "delivery_issuance_delivery_id_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."delivery"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_issuance" ADD CONSTRAINT "delivery_issuance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_issuance_delivery_idx" ON "delivery_issuance" USING btree ("delivery_id","issued_at");--> statement-breakpoint
-- ปล่อยไฟล์ส่งมอบแล้ว = เป็นหลักฐาน แก้ไม่ได้อีก
-- ถ้าต้องแก้ ให้สร้าง delivery แถวใหม่ ของเดิมยังอยู่เป็นบันทึกว่าเคยส่งอะไรไป
-- บังคับที่ระดับฐานข้อมูล ไม่ใช่แค่ในโค้ด — โค้ดมีหลายทางเข้า ตารางมีทางเดียว
CREATE OR REPLACE FUNCTION delivery_is_immutable_after_release() RETURNS trigger AS $$
BEGIN
  IF OLD.released_at IS NOT NULL AND (
       NEW.media_ids   IS DISTINCT FROM OLD.media_ids
    OR NEW.license_type IS DISTINCT FROM OLD.license_type
    OR NEW.released_at  IS DISTINCT FROM OLD.released_at
  ) THEN
    RAISE EXCEPTION 'delivery % ปล่อยไปแล้ว แก้ไม่ได้ — สร้างแถวใหม่แทน', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER delivery_immutable_after_release
  BEFORE UPDATE ON "delivery"
  FOR EACH ROW EXECUTE FUNCTION delivery_is_immutable_after_release();
