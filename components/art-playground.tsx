"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Palette, Sparkles } from "lucide-react";
import { StudioArt, ART_STYLES, ART_PALETTES, type ArtStyle, type ArtPalette } from "@/components/studio-art";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n/dictionaries";

export function ArtPlayground({ copy }: { copy: Dictionary["artHome"] }) {
  const [kind, setKind] = useState<ArtStyle>("chibi");
  const [palette, setPalette] = useState<ArtPalette>("lilac");

  return (
    <div className="art-playground relative mx-auto w-full max-w-xl">
      <div className="studio-paper studio-paper-back" aria-hidden />
      <div className="studio-spark" aria-hidden>✳</div>
      <div className="relative rounded-[1.75rem] border border-foreground/15 bg-card p-3 shadow-xl shadow-primary/10 sm:p-5">
        <div className="studio-tape" aria-hidden />
        <div className="flex items-center justify-between gap-3 px-1 pt-2 pb-3">
          <span className="flex items-center gap-2 text-sm font-semibold"><Palette className="size-4 text-primary" aria-hidden />{copy.playTitle}</span>
          <span className="studio-sticker shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium">{copy.playBadge}</span>
        </div>
        <fieldset className="mb-3">
          <legend className="sr-only">{copy.chooseStyle}</legend>
          <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-muted p-1">
            {ART_STYLES.map((style) => (
              <label key={style} className="relative cursor-pointer">
                <input className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0" type="radio" name="art-style" value={style} checked={kind === style} onChange={() => setKind(style)} />
                <span className="flex min-h-11 items-center justify-center gap-1 rounded-lg border border-transparent px-1 py-2 text-center text-xs font-medium text-muted-foreground transition-colors peer-checked:border-primary/30 peer-checked:bg-card peer-checked:text-primary peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary sm:text-sm">{copy.styles[style]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="overflow-hidden rounded-xl border border-foreground/10">
          <StudioArt kind={kind} palette={palette} className="block aspect-[21/17] w-full" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1 pt-3">
          <fieldset>
            <legend className="sr-only">{copy.choosePalette}</legend>
            <div className="flex gap-1">
              {ART_PALETTES.map((color) => (
                <label key={color} className="relative flex size-11 cursor-pointer items-center justify-center">
                  <input className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0" type="radio" name="art-palette" value={color} checked={palette === color} onChange={() => setPalette(color)} />
                  <span className={`art-swatch art-swatch-${color} flex size-8 items-center justify-center rounded-full border border-black/20 text-[#332840] peer-checked:ring-2 peer-checked:ring-primary peer-checked:ring-offset-2 peer-checked:ring-offset-card peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-primary`}>
                    {palette === color ? <Check className="size-4" aria-hidden /> : null}
                  </span>
                  <span className="sr-only">{copy.palettes[color]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-xs text-muted-foreground">{copy.tryColors}</p>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t px-1 pt-3">
          <p aria-live="polite" aria-atomic="true" className="flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="size-3.5 shrink-0" aria-hidden />{copy.styles[kind]} · {copy.palettes[palette]}</p>
          <Button asChild variant="ghost" size="sm" className="max-w-full text-primary">
            <Link href={`/explore?kind=${kind}`}>{copy.findStyle}<ArrowUpRight className="size-4" aria-hidden /></Link>
          </Button>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">{copy.artNote}</p>
    </div>
  );
}
