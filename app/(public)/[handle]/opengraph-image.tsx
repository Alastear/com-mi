import { ImageResponse } from "next/og";
import { getCreator } from "@/lib/mock/data";

/**
 * OG image ต่อครีเอเตอร์
 *
 * นี่คือช่องทางเติบโตหลักของโปรดักต์: ครีเอเตอร์แชร์ลิงก์ลง X/Discord
 * ถ้าการ์ดพรีวิวดูดี คนกดเข้ามามากขึ้นโดยไม่ต้องยิงโฆษณา (docs/04-ux-and-ia.md §6)
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Commission shop";

export default async function OgImage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const creator = getCreator(handle);

  const name = creator?.displayName ?? handle;
  const tagline = creator?.tagline ?? "";
  const open = creator?.status === "open";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background:
            "radial-gradient(60% 80% at 15% 20%, #6d3fc4 0%, transparent 60%), radial-gradient(55% 75% at 85% 75%, #2f6fd0 0%, transparent 60%), #131316",
          color: "#fafafa",
          fontSize: 32,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, opacity: 0.85 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 13,
              background: "#a970f0",
              display: "flex",
            }}
          />
          <span style={{ fontSize: 30, fontWeight: 600 }}>Commi</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2 }}>{name}</span>
          <span style={{ fontSize: 34, opacity: 0.72, maxWidth: 900 }}>{tagline}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 28 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 22px",
              borderRadius: 999,
              background: open ? "rgba(52,199,123,0.18)" : "rgba(255,255,255,0.10)",
              color: open ? "#5ee49f" : "#b8b8bf",
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: open ? "#5ee49f" : "#8a8a92",
                display: "flex",
              }}
            />
            {open ? "เปิดรับงาน" : "ปิดรับงาน"}
          </div>
          <span style={{ opacity: 0.6 }}>commi.app/@{handle}</span>
        </div>
      </div>
    ),
    size,
  );
}
