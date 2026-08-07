import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { ArtImage } from "@/components/art-image";
import { ServiceOrderFlow } from "@/components/service-order-flow";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getServiceBySlug } from "@/lib/queries/creator";
import { getSession } from "@/lib/auth-guard";
import { serviceHref, shopHref } from "@/lib/routes";
import { normalizeHandle, redirectToCanonicalHandle } from "@/lib/canonical";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";

type Props = { params: Promise<{ handle: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, slug } = await params;
  const found = await getServiceBySlug(handle, slug);
  if (!found) return { title: "404" };
  return {
    title: `${found.service.title} — ${found.shop.displayName}`,
    description: found.service.description,
  };
}

export default async function ServicePage({ params }: Props) {
  const { handle, slug } = await params;
  // เข้ารหัส slug กลับก่อนประกอบเป็นเป้าหมาย redirect — header `Location` รับ ASCII เท่านั้น
  // ถ้าใส่ "วาดภาพครึ่งตัว" ดิบ ๆ ลงไป Node จะโยน ERR_INVALID_CHAR แล้วหน้าพังเป็น 500
  redirectToCanonicalHandle(
    handle,
    serviceHref(normalizeHandle(handle), encodeURIComponent(decodeSlug(slug))),
  );

  const found = await getServiceBySlug(handle, slug);
  if (!found) notFound();

  const { shop, service } = found;

  // ร้านที่ยังไม่เผยแพร่: เจ้าของดูได้ คนอื่นเห็น 404 (เหมือนหน้าร้าน)
  const session = await getSession();
  if (!shop.isPublished && session?.user.id !== shop.userId) notFound();

  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 lg:py-12">
      <Link
        href={shopHref(shop.owner.handle ?? handle)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        {shop.displayName}
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <ArtImage
          seed={service.id}
          src={service.cover?.url}
          alt={service.title}
          ratio={1.1}
          className="w-full"
        />

        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{service.title}</h1>
          {service.description ? (
            <p className="mt-3 leading-relaxed text-muted-foreground">{service.description}</p>
          ) : null}

          {service.includes.length > 0 ? (
            <Card className="mt-6 gap-3 p-5">
              <p className="text-sm font-medium">{t.service.whatYouGet}</p>
              <ul className="space-y-2 text-sm">
                {service.includes.map((line) => (
                  <li key={line} className="flex gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      <Separator className="my-10" />

      <ServiceOrderFlow service={service} shop={shop} />
    </div>
  );
}

/** slug ภาษาไทยมาเป็น %E0%B8%… — ต้องถอดก่อนประกอบ URL ใหม่ ไม่งั้นโดนเข้ารหัสซ้อน */
function decodeSlug(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
