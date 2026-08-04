import { notFound } from "next/navigation";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";

/** ชื่อเอกสารอยู่ในพจนานุกรมชุดเดียวกับที่ footer ใช้ จะได้ไม่หลุดกัน */
const DOCS = ["terms", "privacy"] as const;
type Doc = (typeof DOCS)[number];

export function generateStaticParams() {
  return DOCS.map((doc) => ({ doc }));
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const locale = await getLocale();

  if (!DOCS.includes(doc as Doc)) notFound();
  const t = getDictionary(locale);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{t.legal[doc as Doc]}</h1>
      <p className="mt-4 text-muted-foreground">{t.legal.placeholder}</p>
    </div>
  );
}
