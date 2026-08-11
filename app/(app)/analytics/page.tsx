import { LockedFeature } from "@/components/locked-feature";
import { Card } from "@/components/ui/card";
import { formatMoney, intlLocale } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";

const REVENUE = [18, 24, 31, 22, 40, 36, 52, 44, 61, 55, 72, 68];
const VIEWS = [120, 180, 240, 210, 330, 290, 410, 380, 470, 430, 560, 520];

export default async function AnalyticsPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);

  // ชื่อเดือนไม่ใช่ "ข้อความของโปรดักต์" — ให้ Intl จัดการ จะได้ไม่ต้องดูแลอาร์เรย์ 12 ช่องต่อภาษา
  const monthFmt = new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
  });
  const months = Array.from({ length: 12 }, (_, i) => monthFmt.format(new Date(2026, i, 1)));

  const maxRevenue = Math.max(...REVENUE);
  const maxViews = Math.max(...VIEWS);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:py-8">
      <h1 className="text-xl font-semibold tracking-tight">{t.nav.analytics}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t.analytics.desc}
      </p>

      <LockedFeature variant="soon" className="mt-6">
        <div className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: t.analytics.views, value: "4,340" },
              { label: t.analytics.requests, value: "112" },
              { label: t.analytics.conversion, value: "2.6%" },
            ].map((s) => (
              <Card key={s.label} className="gap-1 p-4">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="tabular text-2xl font-semibold">{s.value}</p>
              </Card>
            ))}
          </div>

          <Card className="gap-4 p-5">
            <div className="flex items-baseline justify-between">
              <p className="font-medium">{t.dashboard.monthRevenue}</p>
              <p className="tabular text-xl font-semibold">
                {formatMoney(6_800_00, "THB", locale)}
              </p>
            </div>
            {/* คอลัมน์ต้องมี "ราง" ที่ความสูงแน่นอนเป็นเจ้าของ % ไม่งั้นแท่งจะสูง 0
                (height:% ที่อยู่ในกล่อง flex ความสูงไม่แน่นอน จะถูกตีเป็น auto) */}
            <div className="flex h-40 gap-1.5">
              {REVENUE.map((v, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex min-h-0 w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t bg-primary"
                      style={{ height: `${(v / maxRevenue) * 100}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground">{months[i]}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="gap-4 p-5">
            <p className="font-medium">{t.analytics.shopViews}</p>
            <div className="flex h-28 items-end gap-1.5">
              {VIEWS.map((v, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-info/70"
                  style={{ height: `${(v / maxViews) * 100}%` }}
                />
              ))}
            </div>
          </Card>
        </div>
      </LockedFeature>
    </div>
  );
}
