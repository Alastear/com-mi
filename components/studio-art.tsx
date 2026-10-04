import type { CSSProperties } from "react";

export const ART_STYLES = ["illustration", "chibi", "emote"] as const;
export type ArtStyle = (typeof ART_STYLES)[number];
export const ART_PALETTES = ["lilac", "peach", "mint"] as const;
export type ArtPalette = (typeof ART_PALETTES)[number];

const palettes: Record<ArtPalette, Record<string, string>> = {
  lilac: { "--art-paper": "#e5dcfc", "--art-ink": "#493466", "--art-pop": "#a68ad6", "--art-light": "#fff4cb", "--art-cheek": "#eea7b2" },
  peach: { "--art-paper": "#ffe0ce", "--art-ink": "#703f50", "--art-pop": "#ec9c84", "--art-light": "#fff6d8", "--art-cheek": "#e98492" },
  mint: { "--art-paper": "#d9ebe0", "--art-ink": "#31584f", "--art-pop": "#87b6a2", "--art-light": "#fff3cb", "--art-cheek": "#e8a198" },
};

/** Original decorative artwork, never presented as a creator's portfolio. */
export function StudioArt({ kind, palette = "lilac", className }: { kind: ArtStyle; palette?: ArtPalette; className?: string }) {
  return (
    <svg viewBox="0 0 420 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" className={className} style={palettes[palette] as CSSProperties}>
      <rect width="420" height="340" fill="var(--art-paper)" />
      <circle cx="337" cy="59" r="99" fill="var(--art-pop)" opacity=".35" />
      <circle cx="52" cy="321" r="115" fill="var(--art-pop)" opacity=".4" />
      <g fill="none" stroke="var(--art-ink)" strokeWidth="1.5" opacity=".17">
        <path d="M0 42H420M0 84H420M0 126H420M0 168H420M0 210H420M0 252H420M0 294H420M42 0V340M84 0V340M126 0V340M168 0V340M210 0V340M252 0V340M294 0V340M336 0V340M378 0V340" />
      </g>
      {kind === "illustration" ? <>
        <path d="M116 314C107 252 126 118 189 89C256 46 308 131 286 203L322 320Z" fill="var(--art-ink)" />
        <path d="M124 340C126 259 166 233 211 232C260 235 304 272 311 340" fill="var(--art-pop)" stroke="var(--art-ink)" strokeWidth="3" />
        <path d="M183 221L179 253Q209 287 244 251L240 216" fill="#e9b298" stroke="var(--art-ink)" strokeWidth="3" />
        <path d="M160 154C159 105 265 91 268 163L261 208Q240 247 210 247Q175 242 160 202Z" fill="#f8cfb2" stroke="var(--art-ink)" strokeWidth="3" />
        <path d="M148 183Q129 104 191 87Q263 70 282 157L276 195Q245 171 234 118Q222 170 148 183" fill="var(--art-ink)" />
        <path d="M173 191Q184 183 196 190M230 189Q242 182 251 190" fill="none" stroke="var(--art-ink)" strokeWidth="4" strokeLinecap="round" />
        <path d="M205 219Q214 225 225 216" fill="none" stroke="#ad6966" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="183" cy="205" rx="12" ry="6" fill="var(--art-cheek)" /><ellipse cx="245" cy="204" rx="12" ry="6" fill="var(--art-cheek)" />
        <path d="M169 266L193 283L207 267L222 284L252 264L270 340H150Z" fill="var(--art-light)" stroke="var(--art-ink)" strokeWidth="3" strokeLinejoin="round" />
        <path d="M209 292V340M140 314L128 293M286 319L300 292" stroke="var(--art-ink)" strokeWidth="3" fill="none" /><circle cx="221" cy="309" r="3" fill="var(--art-pop)" />
        <g transform="translate(268 95) rotate(22)"><path d="M0 0L12 12L0 24L-12 12Z" fill="var(--art-light)" stroke="var(--art-ink)" strokeWidth="2" /></g>
        <path d="M51 244Q73 227 86 206M57 243L55 228M57 243L73 240" stroke="var(--art-ink)" strokeWidth="2" fill="none" strokeLinecap="round" />
      </> : kind === "chibi" ? <>
        <ellipse cx="211" cy="306" rx="94" ry="11" fill="var(--art-ink)" opacity=".12" />
        <path d="M167 235L145 294Q202 318 276 291L251 234Z" fill="var(--art-pop)" stroke="var(--art-ink)" strokeWidth="4" />
        <path d="M190 286L187 308M231 287L235 307" stroke="var(--art-ink)" strokeWidth="10" strokeLinecap="round" />
        <path d="M146 248L119 262M271 247L299 217" stroke="var(--art-ink)" strokeWidth="11" strokeLinecap="round" />
        <path d="M133 167L124 106L177 140M237 137L282 101L284 169" fill="var(--art-light)" stroke="var(--art-ink)" strokeWidth="4" strokeLinejoin="round" />
        <ellipse cx="208" cy="195" rx="86" ry="65" fill="var(--art-light)" stroke="var(--art-ink)" strokeWidth="4" />
        <ellipse cx="175" cy="193" rx="8" ry="13" fill="var(--art-ink)" /><ellipse cx="241" cy="193" rx="8" ry="13" fill="var(--art-ink)" />
        <circle cx="178" cy="189" r="3" fill="white" /><circle cx="244" cy="189" r="3" fill="white" />
        <ellipse cx="151" cy="210" rx="13" ry="7" fill="var(--art-cheek)" /><ellipse cx="265" cy="210" rx="13" ry="7" fill="var(--art-cheek)" />
        <path d="M201 205L207 210L213 205M207 210Q196 229 189 215M207 210Q217 229 225 215" fill="none" stroke="var(--art-ink)" strokeWidth="3" strokeLinecap="round" />
        <path d="M133 153Q217 173 291 145L258 130L223 54L171 135Z" fill="var(--art-ink)" stroke="var(--art-ink)" strokeWidth="3" strokeLinejoin="round" />
        <path d="M173 133Q213 145 258 129" stroke="var(--art-pop)" strokeWidth="12" /><path d="M218 88L222 98L233 99L224 106L226 116L217 111L207 116L210 105L202 98L214 98Z" fill="var(--art-light)" />
        <path d="M208 260L215 271L208 282L201 271Z" fill="var(--art-light)" />
        <path d="M296 228L313 171" stroke="var(--art-ink)" strokeWidth="5" strokeLinecap="round" /><path d="M315 147L320 162L335 167L320 173L315 188L309 173L294 167L309 162Z" fill="var(--art-light)" stroke="var(--art-ink)" strokeWidth="2" />
      </> : <>
        <g transform="translate(53 47) rotate(-9 80 76)">
          <path d="M17 62L15 11L55 38Q83 26 110 39L145 11L147 65C171 153 1 160 17 62Z" fill="var(--art-light)" stroke="var(--art-ink)" strokeWidth="4" strokeLinejoin="round" />
          <path d="M42 78Q53 65 64 78M102 78Q114 64 125 78M72 97Q82 113 94 96" fill="none" stroke="var(--art-ink)" strokeWidth="5" strokeLinecap="round" /><ellipse cx="46" cy="93" rx="13" ry="7" fill="var(--art-cheek)" /><ellipse cx="123" cy="93" rx="13" ry="7" fill="var(--art-cheek)" />
        </g>
        <g transform="translate(214 112) rotate(10 80 76)">
          <path d="M17 62L15 11L55 38Q83 26 110 39L145 11L147 65C171 153 1 160 17 62Z" fill="var(--art-pop)" stroke="var(--art-ink)" strokeWidth="4" strokeLinejoin="round" />
          <path d="M37 72C33 57 51 56 53 65C59 52 77 63 65 76L52 88ZM101 72C96 57 115 56 118 65C124 52 141 64 130 76L116 88Z" fill="var(--art-ink)" /><path d="M72 100Q82 114 95 98" fill="none" stroke="var(--art-ink)" strokeWidth="4" strokeLinecap="round" />
        </g>
        <g transform="translate(74 214) rotate(-8)"><path d="M0 15Q0 0 15 0H99Q114 0 114 15V44Q114 59 99 59H45L27 72V59H15Q0 59 0 44Z" fill="var(--art-ink)" /><path d="M34 20L38 30L48 34L38 38L34 48L30 38L20 34L30 30ZM73 13L77 23L87 27L77 31L73 41L69 31L59 27L69 23Z" fill="var(--art-light)" /></g>
      </>}
      <g fill="var(--art-light)" stroke="var(--art-ink)" strokeWidth="2" strokeLinejoin="round">
        <path d="M64 64L69 78L83 83L69 88L64 102L59 88L45 83L59 78Z" />
        <path d="M353 266L358 280L372 285L358 290L353 304L348 290L334 285L348 280Z" />
      </g>
      <g fill="var(--art-ink)"><circle cx="103" cy="38" r="3" /><circle cx="343" cy="137" r="3" /><circle cx="57" cy="183" r="3" /></g>
      <path d="M314 47Q325 32 335 47Q350 32 357 47Q361 62 335 76Q308 61 314 47Z" fill="var(--art-cheek)" stroke="var(--art-ink)" strokeWidth="2" />
    </svg>
  );
}
