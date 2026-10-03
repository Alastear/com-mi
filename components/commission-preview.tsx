import { ArrowUpRight, Check, Sparkles } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/** Decorative editorial art, not an invented creator, order, or marketplace listing. */
export function CommissionPreview({ t }: { t: Dictionary }) {
  return (
    <div className="commission-preview relative mx-auto w-full max-w-lg p-5 sm:p-8">
      <div className="absolute top-0 right-4 size-28 rounded-full border border-primary/15" aria-hidden />
      <div className="relative rotate-[-3deg] rounded-[1.75rem] border border-border bg-card p-4 shadow-xl shadow-primary/8">
        <div className="mb-3 flex items-center justify-between px-1">
          <span className="flex items-center gap-2 text-xs font-medium"><Sparkles className="size-4 text-primary" />{t.redesign.previewTag}</span>
          <ArrowUpRight className="size-4 text-muted-foreground" aria-hidden />
        </div>
        <svg viewBox="0 0 420 300" className="w-full rounded-2xl" aria-hidden="true" focusable="false">
          <rect width="420" height="300" fill="#e8def4" />
          <circle cx="342" cy="55" r="72" fill="#d3c0e7" />
          <path d="M0 240 Q90 135 205 255 T420 220 V300 H0Z" fill="#a6bdb2" />
          <path d="M0 270 Q100 215 185 285 T420 235 V300 H0Z" fill="#79958b" />
          <path d="M151 239 C135 188 148 88 211 66 C263 47 286 94 274 139 C272 176 300 217 279 253Z" fill="#493657" />
          <path d="M149 300 C148 229 171 208 207 202 C247 203 280 229 289 300" fill="#f5ba8f" />
          <path d="M186 186 L184 215 Q211 246 236 212 L232 182" fill="#e4a387" />
          <ellipse cx="213" cy="140" rx="49" ry="62" fill="#f6cbb0" />
          <path d="M163 148 C155 106 170 75 206 75 C246 65 276 99 268 151 C243 138 232 111 226 91 C221 120 188 132 163 136Z" fill="#493657" />
          <path d="M180 150 Q187 143 194 150 M230 150 Q237 143 244 150" fill="none" stroke="#493657" strokeWidth="4" strokeLinecap="round" />
          <path d="M204 177 Q214 185 226 176" fill="none" stroke="#ad6966" strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="187" cy="165" rx="10" ry="5" fill="#efa7a2" />
          <ellipse cx="240" cy="165" rx="10" ry="5" fill="#efa7a2" />
          <path d="M164 300 L178 241 L242 241 L265 300" fill="#fff5df" />
          <path d="M180 257 Q210 279 247 257" fill="none" stroke="#dfc7a0" strokeWidth="3" />
          <path d="M70 70 L75 87 L92 92 L75 97 L70 114 L65 97 L48 92 L65 87Z M328 172 L332 184 L344 188 L332 192 L328 204 L324 192 L312 188 L324 184Z" fill="#fff9e9" />
          <circle cx="110" cy="181" r="8" fill="#fff9e9" />
          <path d="M291 67 Q299 45 309 63 Q324 53 321 70 L298 90Z" fill="#ac759b" />
        </svg>
        <div className="px-1 pt-4 pb-1">
          <p className="text-lg font-semibold tracking-tight">{t.redesign.previewTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t.redesign.previewNote}</p>
        </div>
      </div>
      <div className="relative -mt-1 ml-6 rotate-[2deg] rounded-2xl border bg-card p-4 shadow-lg shadow-primary/5 sm:ml-12">
        <p className="mb-3 text-xs font-medium">{t.redesign.preview}</p>
        <div className="flex items-start justify-between gap-2">
          {[t.redesign.stepBrief, t.redesign.stepCreate, t.redesign.stepDeliver].map((step, i) => (
            <div key={step} className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
              <span className={i === 2 ? "grid size-8 place-items-center rounded-full bg-primary text-primary-foreground" : "grid size-8 place-items-center rounded-full bg-primary/10 text-primary"}>
                {i === 2 ? <Check className="size-4" aria-hidden /> : <span className="text-xs font-semibold">0{i + 1}</span>}
              </span>
              <span className="text-[11px] text-muted-foreground">{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
