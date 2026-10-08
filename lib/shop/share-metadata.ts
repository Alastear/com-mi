import type { Metadata } from "next";
import { SITE_NAME, siteUrl } from "@/lib/site";

type PublicImage = { url: string; access: string; contentType: string } | null | undefined;

function webUrl(value: string | null | undefined): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch { /* Missing/invalid image falls back to the next source. */ }
}

function publicImage(image: PublicImage): string | undefined {
  return image?.access === "public" && /^image\/(jpeg|png|webp|gif)$/i.test(image.contentType)
    ? webUrl(image.url) : undefined;
}

/** Only public shop/service imagery belongs in crawler-visible metadata. */
export function shareMetadata(input: {
  title: string;
  description: string;
  path: string;
  cover?: PublicImage;
  avatar?: PublicImage;
  ownerImage?: string | null;
}): Metadata {
  const url = new URL(input.path, siteUrl()).href;
  const image = publicImage(input.cover) ?? publicImage(input.avatar) ?? webUrl(input.ownerImage)
    ?? new URL("/share-image", siteUrl()).href;
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: url },
    openGraph: {
      type: "website", siteName: SITE_NAME, title: input.title, description: input.description, url,
      images: [{ url: image, alt: input.title }],
    },
    twitter: {
      card: "summary_large_image", title: input.title, description: input.description,
      images: [{ url: image, alt: input.title }],
    },
  };
}
