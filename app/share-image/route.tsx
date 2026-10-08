import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

/** Public fallback when no shop/service image exists. Never reads private shop data. */
export function GET() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 90, background: "#171020", color: "#fafafa" }}>
      <div style={{ display: "flex", color: "#bf95ff", fontSize: 110, fontWeight: 700 }}>{SITE_NAME}</div>
      <div style={{ display: "flex", fontSize: 38, marginTop: 24 }}>A little space for your big ideas.</div>
      <div style={{ display: "flex", fontSize: 28, marginTop: 22, color: "#c5bdd1" }}>Art commissions · Creators · Your next masterpiece</div>
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
