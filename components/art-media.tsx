"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { ArtImage } from "@/components/art-image";
import { deserializeEmbed, embedIframeUrl, embedWatchUrl } from "@/lib/media/embed";
import { cn } from "@/lib/utils";

/**
 * ผลงานหนึ่งชิ้น — เป็นรูป วิดีโอที่อัปเอง หรือลิงก์ภายนอกก็ได้
 *
 * **วิดีโอไม่โหลดจนกว่าจะกด** — กริดผลงานหกชิ้นที่โหลดวิดีโอครบทุกอัน
 * คือ 100+ MB ต่อการเปิดหน้าหนึ่งครั้ง ทั้งที่คนดูอาจไม่กดสักอัน
 * แสดงภาพปกกับปุ่มเล่นก่อน แล้วค่อยสลับเป็นตัวเล่นจริงเมื่อมีเจตนาชัดเจน
 *
 * ลิงก์ภายนอกก็ใช้หลักเดียวกัน — iframe ของ YouTube ตั้งคุกกี้และโหลดสคริปต์
 * ตั้งแต่วินาทีที่มันอยู่ในหน้า การรอให้กดก่อนจึงไม่ใช่แค่เรื่องแบนด์วิดท์
 */
export function ArtMedia({
  seed,
  alt,
  ratio,
  className,
  rounded,
  /** รูป หรือภาพปกของวิดีโอ */
  posterUrl,
  /** ไฟล์วิดีโอที่อัปเอง */
  videoUrl,
  /** `provider:id` ของวิดีโอภายนอก */
  embedRef,
  durationSeconds,
}: {
  seed: string;
  alt: string;
  ratio?: number | null;
  className?: string;
  rounded?: boolean;
  posterUrl?: string | null;
  videoUrl?: string | null;
  embedRef?: string | null;
  durationSeconds?: number | null;
}) {
  const [playing, setPlaying] = useState(false);
  const embed = embedRef ? deserializeEmbed(embedRef) : null;
  const isVideo = Boolean(videoUrl) || Boolean(embed);

  if (playing && videoUrl) {
    return (
      <video
        src={videoUrl}
        poster={posterUrl ?? undefined}
        controls
        autoPlay
        playsInline
        className={cn("w-full bg-black", rounded !== false && "rounded-lg", className)}
      />
    );
  }

  if (playing && embed) {
    return (
      <div
        className={cn("relative w-full overflow-hidden bg-black", rounded !== false && "rounded-lg", className)}
        style={ratio ? { aspectRatio: String(ratio) } : undefined}
      >
        <iframe
          src={embedIframeUrl(embed)}
          title={alt}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 size-full border-0"
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <ArtImage
        seed={seed}
        src={posterUrl}
        alt={alt}
        ratio={ratio}
        rounded={rounded}
        className={className}
      />
      {isVideo ? (
        <>
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={alt}
            className="absolute inset-0 grid place-items-center transition-colors hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="grid size-12 place-items-center rounded-full bg-black/55 backdrop-blur-sm">
              <Play className="size-5 translate-x-0.5 fill-white text-white" />
            </span>
          </button>
          {durationSeconds ? (
            <span className="tabular pointer-events-none absolute right-2 bottom-2 rounded bg-black/65 px-1.5 py-0.5 text-[11px] text-white">
              {formatDuration(durationSeconds)}
            </span>
          ) : null}
          {/* ทางถอยเมื่อ iframe ถูกบล็อก หรือคนอยากเปิดในแอปของตัวเอง */}
          {embed ? (
            <a
              href={embedWatchUrl(embed)}
              target="_blank"
              rel="noreferrer noopener"
              className="absolute top-2 right-2 rounded bg-black/65 px-1.5 py-0.5 text-[11px] text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            >
              {embed.provider === "youtube" ? "YouTube" : "Vimeo"}
            </a>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
