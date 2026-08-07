/**
 * DTO ของไฟล์ส่งมอบที่ส่งข้ามไปฝั่ง client ได้
 *
 * ⚠️ **ห้ามมี `url` `pathname` `access` หรือ thumbhash เด็ดขาด**
 * `url` ของ store ส่วนตัวเปิดตรง ๆ ไม่ได้ก็จริง (403) แต่การส่งไปฝั่ง client
 * แปลว่ามันไปอยู่ใน HTML ของหน้า ซึ่งเป็นการบอกโครงสร้างที่เก็บไฟล์ให้คนอ่านฟรี ๆ
 * ฝั่ง client ต้องรู้แค่ `mediaId` แล้วขอ URL ผ่าน action ทีละครั้ง
 */
export type DeliveryFileRow = {
  mediaId: string;
  filename: string;
  bytes: number;
  contentType: string;
};

export type DeliveryRow = {
  id: string;
  note: string;
  licenseType: string;
  released: boolean;
  files: DeliveryFileRow[];
};

type MediaLike = {
  id: string;
  filename: string;
  bytes: number;
  contentType: string;
};

export function toDeliveryRow(
  d: { id: string; note: string; licenseType: string; releasedAt: Date | null; mediaIds: string[] },
  media: MediaLike[],
): DeliveryRow {
  const byId = new Map(media.map((m) => [m.id, m]));
  return {
    id: d.id,
    note: d.note,
    licenseType: d.licenseType,
    released: d.releasedAt !== null,
    files: d.mediaIds.flatMap((id) => {
      const m = byId.get(id);
      return m
        ? [{ mediaId: m.id, filename: m.filename, bytes: m.bytes, contentType: m.contentType }]
        : [];
    }),
  };
}
