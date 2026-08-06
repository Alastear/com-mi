/** ชนิดของไฟล์ที่อัปโหลดได้ตอนนี้ — เพิ่ม reference/wip/final ตอน Phase 1b */
export const MEDIA_KINDS = ["avatar", "banner", "portfolio", "service_cover"] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];
