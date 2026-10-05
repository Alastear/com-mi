import { getLocale } from "@/lib/i18n/server";

export default async function ClientsLoading() {
  const locale = await getLocale();
  return <div role="status" aria-busy="true" className="mx-auto w-full max-w-4xl space-y-4 px-4 py-8"><p className="text-sm text-muted-foreground">{locale === "th" ? "กำลังโหลดข้อมูลลูกค้า…" : "Loading clients…"}</p>{[0, 1, 2].map(i => <div key={i} aria-hidden="true" className="h-20 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />)}</div>;
}
