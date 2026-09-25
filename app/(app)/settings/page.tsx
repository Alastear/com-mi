import Link from "next/link";
import { eq } from "drizzle-orm";
import { Bell, CreditCard, MessageSquare, Store, User } from "lucide-react";
import { ComingSoonBadge } from "@/components/locked-feature";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { shopUrlPrefix } from "@/lib/site";
import { requireCreator } from "@/lib/auth-guard";
import { planDisplay, type PlanId } from "@/lib/billing/plans";
import { getDb, schema } from "@/lib/db";
import { getOwnShop } from "@/lib/queries/creator";
import { ensureShop } from "@/lib/shop/ensure";
import { UserAvatar } from "@/components/user-avatar";
import { ContactForm } from "./contact-form";
import { PayoutForm } from "./payout-form";
import type { PromptPayType } from "@/lib/payments/promptpay-id";

export default async function SettingsPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);

  const { user } = await requireCreator();
  await ensureShop(user.id, user.name);
  const [shop, accounts] = await Promise.all([
    getOwnShop(user.id),
    /**
     * ป้ายวิธีเข้าสู่ระบบต้องมาจากบัญชีที่ผูกไว้จริง
     * เดิมขึ้นว่า "เข้าสู่ระบบด้วย Google" ให้ทุกคน ทั้งที่เปิดอีเมล+รหัสผ่านได้แล้ว
     * (lib/auth.ts — เปิดเมื่อมี EMAIL_FROM) คนที่สมัครด้วยรหัสผ่านจึงถูกบอกเรื่องที่ไม่จริง
     */
    getDb()
      .select({ providerId: schema.account.providerId })
      .from(schema.account)
      .where(eq(schema.account.userId, user.id)),
  ]);
  const providers = new Set(accounts.map((a) => a.providerId));
  const signInBadges = [
    providers.has("google") ? t.settings.signedInWithGoogle : null,
    // "credential" คือชื่อที่ Better Auth ใช้กับบัญชีอีเมล+รหัสผ่าน
    providers.has("credential") ? t.settings.signedInWithPassword : null,
  ].filter((x): x is string => x !== null);

  const plan = planDisplay((user.plan ?? "free") as PlanId);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:py-8">
      <h1 className="text-xl font-semibold tracking-tight">{t.nav.settings}</h1>

      <Tabs defaultValue="profile" className="mt-5">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="profile">
            <User className="size-3.5" />
            {t.settings.profile}
          </TabsTrigger>
          <TabsTrigger value="shop">
            <Store className="size-3.5" />
            {t.nav.shop}
          </TabsTrigger>
          <TabsTrigger value="payments">
            <CreditCard className="size-3.5" />
            {t.settings.payments}
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="size-3.5" />
            {t.nav.inbox}
          </TabsTrigger>
        </TabsList>

        {/* โปรไฟล์ — ของจริงจาก session ทั้งหมด */}
        <TabsContent value="profile" className="mt-5">
          <Card className="gap-5 p-5">
            <div>
              <p className="font-medium">{t.settings.account}</p>
              <div className="mt-3 flex items-center gap-4">
                <UserAvatar
                  user={{
                    name: user.name,
                    email: user.email,
                    image: shop?.avatar?.url ?? user.image ?? null,
                  }}
                  className="size-16"
                />
                <div className="min-w-0">
                  <p className="font-medium">{user.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                  {signInBadges.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {signInBadges.map((label) => (
                        <Badge key={label} variant="secondary">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <Label htmlFor="handle">{t.settings.handle}</Label>
              <div className="mt-1.5 flex items-center">
                <span className="rounded-l-lg border border-r-0 bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {shopUrlPrefix()}
                </span>
                {/*
                  อ่านอย่างเดียว — เปลี่ยน handle = ลิงก์ที่ครีเอเตอร์แปะ bio ไว้ตายทันที
                  ปุ่มที่กดแล้วไม่บันทึกแย่กว่าไม่มีปุ่ม จึงล็อกไว้ตรง ๆ พร้อมบอกเหตุผล
                */}
                <Input
                  id="handle"
                  defaultValue={user.handle ?? ""}
                  readOnly
                  aria-describedby="handle-note"
                  className="rounded-l-none bg-muted/40"
                />
              </div>
              <p id="handle-note" className="mt-1.5 text-xs text-muted-foreground">
                {t.settings.handleLocked} — {t.settings.handleLockedHint}
              </p>
            </div>

            <Separator />

            <div>
              <p className="font-medium">{t.settings.contactTitle}</p>
              <div className="mt-3">
                <ContactForm initial={shop?.contactPhone ?? ""} />
              </div>
            </div>

            <Separator />

            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 text-sm text-muted-foreground">{t.settings.editInShop}</p>
              <Button asChild size="sm" variant="outline">
                <Link href="/shop">{t.settings.goToShop}</Link>
              </Button>
            </div>
          </Card>
        </TabsContent>

        {/* หน้าร้าน */}
        <TabsContent value="shop" className="mt-5 space-y-4">
          {/*
            เดิมมีปุ่มเลือกสถานะซ้ำกับหน้า /shop แต่กดแล้วไม่บันทึกอะไรเลย
            แสดงสถานะจริงแล้วส่งไปแก้ที่เดียว ดีกว่ามีสองที่ที่ไม่ตรงกัน
          */}
          <Card className="flex-row flex-wrap items-center gap-4 p-5">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t.settings.shopStatusTitle}</p>
              <p className="text-sm text-muted-foreground">{t.settings.shopStatusDesc}</p>
            </div>
            <Badge variant="secondary">
              {t.shopStatus[(shop?.status ?? "open") as keyof typeof t.shopStatus]}
            </Badge>
            <Button asChild size="sm" variant="outline">
              <Link href="/shop">{t.common.edit}</Link>
            </Button>
          </Card>

          {/*
            ธีมหน้าร้านยังไม่ได้สร้าง — คอลัมน์ `creator_page.theme` ไม่มีใครเขียนหรืออ่าน
            เดิมตรงนี้มีปุ่มวงกลมสีสามปุ่มที่กดแล้วไม่เกิดอะไร กับป้าย Pro ที่ชวนให้จ่ายเพื่อปลดล็อก
            ปุ่มที่กดแล้วไม่บันทึกแย่กว่าไม่มีปุ่ม จึงเหลือแค่การ์ดที่บอกตรง ๆ ว่ายังไม่มี
          */}
          <Card className="gap-2 p-5">
            <div className="flex items-center gap-2">
              <p className="font-medium">{t.settings.themeTitle}</p>
              <ComingSoonBadge />
            </div>
            <p className="text-sm text-muted-foreground">
              {t.settings.themeDesc}
            </p>
          </Card>
        </TabsContent>

        {/* การรับเงิน */}
        <TabsContent value="payments" className="mt-5 space-y-4">
          <Card className="gap-4 p-5">
            <div>
              <p className="font-medium">PromptPay</p>
              <p className="text-sm text-muted-foreground">
                {t.settings.promptpayDesc}
              </p>
            </div>
            <PayoutForm
              initial={{
                type: (shop?.promptpayType ?? "phone") as PromptPayType,
                id: shop?.promptpayId ?? "",
                name: shop?.promptpayName ?? "",
              }}
            />
            <p className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
              {t.settings.noFeeNote}
            </p>
          </Card>

          {/*
            แพ็กเกจที่โชว์ต้องเป็นตัวที่ใช้ตัดสินลิมิตจริง (planDisplay → effectivePlan)
            ช่วงเบต้าทุกคนได้ Pro จึงไม่มีปุ่มอัปเกรด — ปุ่มที่ขายของที่ได้ไปแล้ว
            ทำให้คนเข้าใจว่ายังขาดอะไรอยู่
          */}
          <Card className="flex-row flex-wrap items-center gap-4 p-5">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t.settings.currentPlan}</p>
              <p className="text-sm text-muted-foreground">
                {t.plan[plan.shown]}
                {plan.viaBeta ? ` · ${t.settings.planBetaNote}` : null}
              </p>
            </div>
            {plan.offerUpgrade ? (
              <Button asChild>
                <Link href="/pricing">{t.common.upgrade}</Link>
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href="/pricing">{t.settings.viewPlans}</Link>
              </Button>
            )}
          </Card>
        </TabsContent>

        {/* การแจ้งเตือน */}
        {/*
          ⚠️ `soon` = ยังไม่มีโค้ดส่งเลย (ไม่มี service worker / VAPID / webhook ในโปรเจกต์)
          เดิมสองแถวนี้ติดป้าย Pro พร้อมปุ่ม "อัปเกรด" — ช่วงเบต้าทุกคนเป็น Pro อยู่แล้ว
          และต่อให้จ่ายจริงก็ไม่ได้อะไร จึงเป็นป้าย "เร็ว ๆ นี้" ไม่มีปุ่มให้กด
        */}
        <TabsContent value="notifications" className="mt-5 space-y-4">
          {[
            {
              icon: Bell,
              title: t.settings.notifyInApp,
              body: t.settings.notifyInAppBody,
              soon: false,
            },
            {
              icon: MessageSquare,
              title: t.settings.notifyEmail,
              body: t.settings.notifyEmailBody,
              soon: false,
            },
            {
              icon: Bell,
              title: "Web Push",
              body: t.settings.notifyPushBody,
              soon: true,
            },
            {
              icon: MessageSquare,
              title: "Discord",
              body: t.settings.notifyDiscordBody,
              soon: true,
            },
          ].map((n) => (
            <Card key={n.title} className="flex-row items-center gap-4 p-4">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/50">
                <n.icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">{n.title}</p>
                <p className="text-sm text-muted-foreground">{n.body}</p>
              </div>
              {n.soon ? (
                <ComingSoonBadge />
              ) : (
                <Badge variant="secondary">{t.common.on}</Badge>
              )}
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
