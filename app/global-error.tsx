"use client";

/**
 * รับ error ที่เกิดใน root layout เอง — ต้องเรนเดอร์ <html>/<body> ของตัวเอง
 * และห้ามพึ่ง provider ใด ๆ เพราะ provider อาจเป็นตัวที่พัง
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="th">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#131316",
          color: "#f4f4f5",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        <div>
          <p style={{ fontSize: "1.125rem", fontWeight: 600 }}>
            เกิดข้อผิดพลาดร้ายแรง / Something broke badly
          </p>
          {error.digest ? (
            <p style={{ fontSize: "0.75rem", opacity: 0.6, fontFamily: "monospace" }}>
              {error.digest}
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #3f3f46",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            ลองใหม่ / Try again
          </button>
        </div>
      </body>
    </html>
  );
}
