import Link from "next/link";
import { Bell, CreditCard, MessageSquare, Store, User } from "lucide-react";
import { ProBadge } from "@/components/locked-feature";
import { ArtAvatar } from "@/components/art-image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { creator } from "@/lib/mock/data";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";

export default async function SettingsPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);

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

        {/* โปรไฟล์ */}
        <TabsContent value="profile" className="mt-5">
          <Card className="gap-5 p-5">
            <div className="flex items-center gap-4">
              <ArtAvatar seed={creator.avatarSeed} alt={creator.displayName} className="size-16" />
              <div>
                <p className="font-medium">{creator.displayName}</p>
                <p className="text-sm text-muted-foreground">you@example.com</p>
                <Badge variant="secondary" className="mt-1.5">
                  {t.settings.signedInWithGoogle}
                </Badge>
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="displayName">{t.settings.displayName}</Label>
                <Input id="displayName" defaultValue={creator.displayName} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="handle">{t.settings.handle}</Label>
                <div className="mt-1.5 flex items-center">
                  <span className="rounded-l-lg border border-r-0 bg-muted px-3 py-2 text-sm text-muted-foreground">
                    commi.app/@
                  </span>
                  <Input id="handle" defaultValue={creator.handle} className="rounded-l-none" />
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* หน้าร้าน */}
        <TabsContent value="shop" className="mt-5 space-y-4">
          <Card className="gap-4 p-5">
            <div>
              <p className="font-medium">{t.settings.shopStatusTitle}</p>
              <p className="text-sm text-muted-foreground">
                {t.settings.shopStatusDesc}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["open", "waitlist", "closed", "vacation"] as const).map((s) => (
                <Button key={s} variant={s === creator.status ? "default" : "outline"} size="sm">
                  {t.shopStatus[s]}
                </Button>
              ))}
            </div>
          </Card>

          <Card className="gap-4 p-5">
            <div className="flex items-center gap-2">
              <p className="font-medium">{t.settings.themeTitle}</p>
              <ProBadge />
            </div>
            <p className="text-sm text-muted-foreground">
              {t.settings.themeDesc}
            </p>
            <div className="flex gap-2">
              {["oklch(0.735 0.165 305)", "oklch(0.7 0.14 250)", "oklch(0.735 0.155 155)"].map(
                (c, i) => (
                  <button
                    key={c}
                    aria-label={`preset ${i + 1}`}
                    className="size-8 rounded-full ring-2 ring-border ring-offset-2 ring-offset-background"
                    style={{ background: c }}
                  />
                ),
              )}
            </div>
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
            <div className="max-w-xs">
              <Label htmlFor="promptpay">
                {t.settings.promptpayLabel}
              </Label>
              <Input id="promptpay" placeholder="08X-XXX-XXXX" className="mt-1.5" />
            </div>
            <p className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
              {t.settings.noFeeNote}
            </p>
          </Card>

          <Card className="flex-row items-center gap-4 p-5">
            <div className="flex-1">
              <p className="font-medium">{t.settings.currentPlan}</p>
              <p className="text-sm text-muted-foreground">{t.plan.free}</p>
            </div>
            <Button asChild>
              <Link href="/pricing">{t.common.upgrade}</Link>
            </Button>
          </Card>
        </TabsContent>

        {/* การแจ้งเตือน */}
        <TabsContent value="notifications" className="mt-5 space-y-4">
          {[
            {
              icon: Bell,
              title: t.settings.notifyInApp,
              body: t.settings.notifyInAppBody,
              pro: false,
            },
            {
              icon: MessageSquare,
              title: t.settings.notifyEmail,
              body: t.settings.notifyEmailBody,
              pro: false,
            },
            {
              icon: Bell,
              title: "Web Push",
              body: t.settings.notifyPushBody,
              pro: true,
            },
            {
              icon: MessageSquare,
              title: "Discord",
              body: t.settings.notifyDiscordBody,
              pro: true,
            },
          ].map((n) => (
            <Card key={n.title} className="flex-row items-center gap-4 p-4">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/50">
                <n.icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {n.title}
                  {n.pro ? <ProBadge /> : null}
                </p>
                <p className="text-sm text-muted-foreground">{n.body}</p>
              </div>
              {n.pro ? (
                <Button asChild size="sm" variant="outline">
                  <Link href="/pricing">{t.common.upgrade}</Link>
                </Button>
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
