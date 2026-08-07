import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deserializeEmbed, embedIframeUrl, parseEmbed, serializeEmbed } from "./embed";

describe("ลิงก์วิดีโอภายนอก", () => {
  it("รับรูปแบบที่คนก็อปมาจริง", () => {
    const cases: [string, string][] = [
      ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube:dQw4w9WgXcQ"],
      ["https://youtu.be/dQw4w9WgXcQ", "youtube:dQw4w9WgXcQ"],
      ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "youtube:dQw4w9WgXcQ"],
      ["https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "youtube:dQw4w9WgXcQ"],
      ["https://vimeo.com/123456789", "vimeo:123456789"],
      ["  https://vimeo.com/123456789  ", "vimeo:123456789"],
    ];
    for (const [url, want] of cases) {
      const p = parseEmbed(url);
      assert.ok(p, url);
      assert.equal(serializeEmbed(p!), want, url);
    }
  });

  it("ปฏิเสธทุกโดเมนที่ไม่ได้อยู่ในรายชื่อ — ค่านี้จะไปอยู่ใน src ของ iframe", () => {
    for (const bad of [
      "https://evil.example/video",
      "https://youtube.com.evil.example/watch?v=abc123",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "http://www.youtube.com/watch?v=dQw4w9WgXcQ", // ต้องเป็น https
      "https://www.youtube.com/",
      "",
      "ไม่ใช่ url",
    ]) {
      assert.equal(parseEmbed(bad), null, bad);
    }
  });

  it("query string ที่ติดมาถูกทิ้ง — ประกอบ URL ใหม่จาก id เสมอ", () => {
    const p = parseEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxx&t=99")!;
    const iframe = embedIframeUrl(p);
    assert.equal(iframe.includes("list="), false);
    assert.equal(iframe.includes("t=99"), false);
    assert.match(iframe, /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  });

  it("เก็บลง DB แล้วอ่านกลับได้เหมือนเดิม", () => {
    for (const url of ["https://youtu.be/dQw4w9WgXcQ", "https://vimeo.com/123456789"]) {
      const p = parseEmbed(url)!;
      assert.deepEqual(deserializeEmbed(serializeEmbed(p)), p);
    }
  });

  it("ค่าที่เสียใน DB ไม่ทำให้พัง", () => {
    for (const bad of ["", "youtube:", ":abc", "twitch:abc123", "youtube:../../etc"]) {
      assert.equal(deserializeEmbed(bad), null, bad);
    }
  });
});
