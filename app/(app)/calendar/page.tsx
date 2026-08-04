import { LockedFeature } from "@/components/locked-feature";
import { Card } from "@/components/ui/card";
import { orders } from "@/lib/mock/data";
import { intlLocale } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

export default async function CalendarPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);

  // ชื่อวันมาจาก Intl เช่นเดียวกับชื่อเดือนในหน้า analytics
  const dayFmt = new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "short",
  });
  // 2026-01-05 เป็นวันจันทร์ — ไล่ไป 7 วันได้จันทร์→อาทิตย์
  const weekdays = Array.from({ length: 7 }, (_, i) => dayFmt.format(new Date(2026, 0, 5 + i)));

  const withDeadlines = orders.filter((o) => o.dueAt);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 lg:py-8">
      <h1 className="text-xl font-semibold tracking-tight">{t.nav.calendar}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t.calendar.desc}
      </p>

      <LockedFeature className="mt-6">
        <Card className="p-4">
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
            {weekdays.map((d) => (
              <div key={d} className="py-1.5 font-medium">
                {d}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }, (_, i) => {
              const day = i - 2;
              const inMonth = day >= 1 && day <= 31;
              const hasDeadline = inMonth && [4, 9, 15, 16, 23, 28].includes(day);
              return (
                <div
                  key={i}
                  className={cn(
                    "min-h-16 rounded-lg border p-1.5 text-left",
                    !inMonth && "opacity-30",
                  )}
                >
                  <span className="tabular text-xs text-muted-foreground">
                    {inMonth ? day : ""}
                  </span>
                  {hasDeadline && (
                    <div className="mt-1 truncate rounded bg-primary/15 px-1 py-0.5 text-[10px] text-primary">
                      #{withDeadlines[day % withDeadlines.length]?.code ?? "—"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </LockedFeature>
    </div>
  );
}
