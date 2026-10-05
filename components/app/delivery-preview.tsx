"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useLocale } from "@/lib/i18n/client";
import { requestDeliveryDownload } from "@/lib/delivery/actions";

export function DeliveryPreview({ code, mediaId, filename, contentType }: { code: string; mediaId: string; filename: string; contentType: string }) {
  const { t, locale } = useLocale();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const trigger = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!contentType.startsWith("image/") || !["image/jpeg", "image/png", "image/webp"].includes(contentType)) return;
    let active = true;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void requestDeliveryDownload(code, mediaId, true).then(res => {
        if (active && res.ok) setThumbnail(res.url);
      }).catch(() => {});
    });
    if (trigger.current) observer.observe(trigger.current);
    return () => { active = false; observer.disconnect(); };
  }, [code, mediaId, contentType]);
  if (!["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"].includes(contentType)) return null;
  async function open() {
    setBusy(true);
    try {
      const res = await requestDeliveryDownload(code, mediaId, true);
      if (res.ok) setUrl(res.url); else toast.error(t.error.title);
    } catch { toast.error(t.error.title); }
    finally { setBusy(false); }
  }
  return <><div ref={trigger}><Button variant="outline" size="sm" disabled={busy} onClick={() => void open()}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Authorized private thumbnail fetched after mount. */}
      {thumbnail ? <img src={thumbnail} alt="" className="size-14 rounded-md object-cover" /> : null}
      {locale === "th" ? "ดูตัวอย่าง" : "Preview"}</Button></div>
    <Dialog open={url !== null} onOpenChange={open => { if (!open) setUrl(null); }}><DialogContent className="max-w-3xl"><DialogTitle>{filename}</DialogTitle>
      {url ? contentType.startsWith("video/") ? <video src={url} controls className="max-h-[70vh] w-full" /> :
        // eslint-disable-next-line @next/next/no-img-element -- Authorized private media, no optimization.
        <img src={url} alt={filename} className="max-h-[70vh] w-full object-contain" /> : null}
    </DialogContent></Dialog>
  </>;
}
