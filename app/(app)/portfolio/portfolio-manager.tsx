"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ArtMedia } from "@/components/art-media";
import { PortfolioUploader } from "@/components/portfolio-uploader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDict } from "@/lib/i18n/client";
import { removePortfolioItem } from "@/lib/media/actions";

type Item = {
  id: string;
  /** null เมื่อชิ้นนี้เป็นลิงก์วิดีโอภายนอก */
  mediaId: string | null;
  title: string;
  embedRef: string | null;
  url: string | null;
  posterUrl: string | null;
  durationSeconds: number | null;
  contentType: string | null;
  width: number | null;
  height: number | null;
};

/** วิดีโอที่อัปเอง — ดูจาก contentType ไม่ใช่จากนามสกุลไฟล์ */
function isVideo(item: { contentType: string | null }): boolean {
  return Boolean(item.contentType?.startsWith("video/"));
}

export function PortfolioManager({
  items,
  max,
}: {
  items: Item[];
  max: number;
}) {
  const t = useDict();
  const router = useRouter();
  const [pending, start] = useTransition();

  const atLimit = items.length >= max;

  function remove(id: string) {
    start(async () => {
      await removePortfolioItem(id);
      router.refresh();
      toast.success(t.media.remove);
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t.nav.portfolio}</h1>
          <p className="tabular text-sm text-muted-foreground">
            {items.length} / {max}
          </p>
        </div>
      </div>

      {atLimit ? (
        <Card className="mt-5 flex-row items-center gap-3 border-primary/40 bg-primary/5 p-4">
          <p className="flex-1 text-sm">{t.media.quotaFull}</p>
        </Card>
      ) : (
        <div className="mt-5">
          <PortfolioUploader onDone={() => router.refresh()} />
        </div>
      )}

      {items.length > 0 ? (
        <div className="masonry mt-6 columns-2 sm:columns-3 lg:columns-4">
          {items.map((p) => (
            <figure key={p.id} className="group relative">
              <ArtMedia
                seed={p.mediaId ?? p.id}
                alt={p.title || t.nav.portfolio}
                ratio={p.width && p.height ? p.width / p.height : 1}
                posterUrl={p.posterUrl ?? (isVideo(p) ? null : p.url)}
                videoUrl={isVideo(p) ? p.url : null}
                embedRef={p.embedRef}
                durationSeconds={p.durationSeconds}
              />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                disabled={pending}
                aria-label={t.media.remove}
                onClick={() => remove(p.id)}
                className="absolute top-2 right-2 size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </figure>
          ))}
        </div>
      ) : (
        <p className="mt-8 text-center text-sm text-muted-foreground">{t.media.choose}</p>
      )}

      <p className="mt-6 text-xs text-muted-foreground">{t.portfolio.storageNote}</p>
    </div>
  );
}
