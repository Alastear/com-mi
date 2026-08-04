import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { ArtImage } from "@/components/art-image";
import { ServiceOrderFlow } from "@/components/service-order-flow";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getCreator, getService, services } from "@/lib/mock/data";
import { shopHref } from "@/lib/routes";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";

type Props = { params: Promise<{ handle: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, slug } = await params;
  const creator = getCreator(handle);
  const service = getService(slug);
  if (!creator || !service) return { title: "404" };
  return {
    title: `${service.title} — ${creator.displayName}`,
    description: service.description,
  };
}

export function generateStaticParams() {
  return services.map((s) => ({ handle: "nongfah", slug: s.slug }));
}

export default async function ServicePage({ params }: Props) {
  const { handle, slug } = await params;
  const creator = getCreator(handle);
  const service = getService(slug);
  if (!creator || !service) notFound();

  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 lg:py-12">
      <Link
        href={shopHref(creator.handle)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        {creator.displayName}
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        {/* แกลเลอรีตัวอย่างงาน */}
        <div>
          <ArtImage
            seed={service.gallerySeeds[0]}
            alt={service.title}
            ratio={1.1}
            className="w-full"
          />
          <div className="mt-3 grid grid-cols-3 gap-3">
            {service.gallerySeeds.slice(1).map((seed) => (
              <ArtImage key={seed} seed={seed} alt={service.title} ratio={1} />
            ))}
          </div>
        </div>

        {/* รายละเอียด */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{service.title}</h1>
          <p className="mt-3 leading-relaxed text-muted-foreground">{service.description}</p>

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
        </div>
      </div>

      <Separator className="my-10" />

      <ServiceOrderFlow service={service} creator={creator} />
    </div>
  );
}
