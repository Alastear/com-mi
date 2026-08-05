import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Thai } from "next/font/google";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

/**
 * ฟอนต์ไทยต้องมีตั้งแต่แรก — ฟอนต์ระบบเรนเดอร์ไทยผสมอังกฤษได้แย่มาก
 * (ความสูงบรรทัดกระโดด สระซ้อนกัน) ดู docs/04-ux-and-ia.md §4.2
 */
const notoThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  // จำเป็นสำหรับ resolve URL ของ OG image ให้เป็น absolute — ถ้าไม่ตั้ง
  // การ์ดพรีวิวตอนแชร์ลิงก์หน้าร้านจะชี้ไป localhost บน production
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Commi — ระบบรับงาน commission",
    template: "%s · Commi",
  },
  description:
    "หน้าร้านรับงาน commission พร้อมระบบจัดการคิว ส่งงาน และเก็บเงิน สำหรับนักวาด นักตัดต่อ และคนทำ adopts",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfdfe" },
    { media: "(prefers-color-scheme: dark)", color: "#131316" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${notoThai.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers locale={locale}>
          {children}
          <Toaster position="bottom-right" />
        </Providers>
        <span className="sr-only">{t.brand.tagline}</span>
      </body>
    </html>
  );
}
