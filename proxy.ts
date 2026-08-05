import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * ชื่อไฟล์ `proxy.ts` และชื่อฟังก์ชัน `proxy` — Next.js 16 เปลี่ยนจาก `middleware` แล้ว
 * รันบน Node.js runtime โดยปริยาย (ตั้ง `runtime` ที่นี่ไม่ได้ จะ throw)
 *
 * ⚠️ นี่เป็นแค่ "UX gate" กันหน้าจอกระพริบเท่านั้น — เช็คแค่ว่ามีคุกกี้ไหม ไม่ query DB
 *
 * การตรวจสิทธิ์จริงต้องอยู่ใน Server Action / Route Handler ทุกจุดเสมอ
 * เพราะ Server Function ไม่ใช่ route แยก — ถ้า matcher ไม่ครอบ path นั้น proxy ก็ไม่ทำงาน
 * และการย้าย action ไปไฟล์อื่นทำให้หลุดการป้องกันแบบเงียบ ๆ ได้
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(signIn);
}

/**
 * ⚠️ matcher ต้องเป็น literal ล้วน ๆ — Next วิเคราะห์ค่านี้ตอน build
 * ถ้าสร้างด้วย .map() หรือตัวแปร build จะพังทันที (หรือแย่กว่านั้นคือถูกเมิน)
 * เพิ่ม route ใหม่ในกลุ่ม (app) แล้วอย่าลืมมาเติมที่นี่ด้วย
 */
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/orders/:path*",
    "/services/:path*",
    "/portfolio/:path*",
    "/listings/:path*",
    "/clients/:path*",
    "/calendar/:path*",
    "/analytics/:path*",
    "/settings/:path*",
    "/my/:path*",
    "/onboarding",
  ],
};
