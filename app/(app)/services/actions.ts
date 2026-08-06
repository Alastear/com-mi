"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { requireCreator } from "@/lib/auth-guard";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { PLANS } from "@/lib/billing/plans";
import { ensureShop } from "@/lib/shop/ensure";
import { slugify, uniqueSlug } from "@/lib/services/slug";
import { dynamicHref } from "@/lib/routes";
import { SERVICE_KINDS, SERVICE_MODES } from "@/lib/types";

/** หน้าร้านของผู้ใช้ + slug ที่ถูกใช้ไปแล้ว — ทุก action ต้องผ่านตรงนี้ก่อนแตะข้อมูล */
async function ownPage(userId: string) {
  const page = await getDb().query.creatorPage.findFirst({
    columns: { id: true },
    where: eq(schema.creatorPage.userId, userId),
    with: {
      services: {
        columns: { id: true, slug: true, deletedAt: true },
      },
    },
  });
  if (!page) throw new Error("no_shop");
  return page;
}

/** ยืนยันว่า service นี้เป็นของผู้ใช้จริง ก่อนแก้หรือลบ */
async function assertOwned(userId: string, serviceId: string): Promise<string> {
  const page = await ownPage(userId);
  const owned = page.services.some((s) => s.id === serviceId);
  if (!owned) throw new Error("not_found");
  return page.id;
}

export async function createService() {
  const { user } = await requireCreator();
  await ensureShop(user.id, user.name, await getLocale());
  const page = await ownPage(user.id);

  const live = page.services.filter((s) => !s.deletedAt);
  // TODO Phase 2: อ่านลิมิตจาก plan จริงของผู้ใช้ผ่าน entitlements
  if (live.length >= PLANS.free.limits.services) redirect("/services");

  const t = getDictionary(await getLocale());
  const id = newId("svc");

  await getDb().insert(schema.service).values({
    id,
    creatorPageId: page.id,
    slug: uniqueSlug(slugify(t.service.newTitle), live.map((s) => s.slug)),
    title: t.service.newTitle,
    sortOrder: live.length,
    // เริ่มเป็นปิดไว้ก่อน — ไม่ให้เมนูเปล่า ๆ โผล่บนหน้าร้านทันทีที่กดเพิ่ม
    isActive: false,
  });

  revalidatePath("/services");
  redirect(dynamicHref(`/services/${id}`));
}

const TierSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1).max(60),
  priceDeltaCents: z.number().int().min(0).max(100_000_00),
});

const OptionSchema = z.object({
  id: z.string().optional(),
  groupLabel: z.string().trim().max(60).default(""),
  label: z.string().trim().min(1).max(60),
  priceDeltaCents: z.number().int().min(0).max(100_000_00),
  inputType: z.enum(["checkbox", "quantity"]),
  maxQuantity: z.number().int().min(1).max(99).nullable(),
});

const SaveSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000),
  slug: z.string().trim().max(60),
  kind: z.enum(SERVICE_KINDS),
  mode: z.enum(SERVICE_MODES),
  // ฟอร์มรับเป็นบาท แต่ DB เก็บเป็นสตางค์ — ปัดเศษทิ้งเพื่อไม่ให้มีสตางค์ค้าง
  basePriceCents: z.coerce.number().min(0).max(1_000_000).transform((b) => Math.round(b) * 100),
  deliveryDays: z.coerce.number().int().min(1).max(365),
  revisionsIncluded: z.coerce.number().int().min(0).max(99),
  includes: z.string().max(2000),
  isActive: z.coerce.boolean(),
  tiers: z.string().transform((s, ctx) => {
    const parsed = z.array(TierSchema).max(10).safeParse(JSON.parse(s || "[]"));
    if (!parsed.success) ctx.addIssue({ code: "custom", message: "tiers" });
    return parsed.success ? parsed.data : [];
  }),
  options: z.string().transform((s, ctx) => {
    const parsed = z.array(OptionSchema).max(20).safeParse(JSON.parse(s || "[]"));
    if (!parsed.success) ctx.addIssue({ code: "custom", message: "options" });
    return parsed.success ? parsed.data : [];
  }),
});

export type SaveServiceResult = { ok: true; slug: string } | { ok: false } | undefined;

export async function saveService(
  _prev: SaveServiceResult,
  formData: FormData,
): Promise<SaveServiceResult> {
  const { user } = await requireCreator();

  const raw = Object.fromEntries(formData);
  const parsed = SaveSchema.safeParse({ ...raw, isActive: raw.isActive === "on" });
  if (!parsed.success) return { ok: false };
  const v = parsed.data;

  await assertOwned(user.id, v.id);
  const page = await ownPage(user.id);
  const db = getDb();

  // slug ต้องไม่ชนกับเมนูอื่นในร้านเดียวกัน (unique index บังคับอยู่แล้ว แต่ error หน้าตาแย่)
  const others = page.services.filter((s) => s.id !== v.id).map((s) => s.slug);
  const slug = uniqueSlug(slugify(v.slug) || slugify(v.title), others);

  await db
    .update(schema.service)
    .set({
      title: v.title,
      description: v.description,
      slug,
      kind: v.kind,
      mode: v.mode,
      basePriceCents: v.basePriceCents,
      deliveryDays: v.deliveryDays,
      revisionsIncluded: v.revisionsIncluded,
      includes: v.includes
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 20),
      isActive: v.isActive,
      updatedAt: new Date(),
    })
    .where(eq(schema.service.id, v.id));

  await syncRows(v.id, v.tiers, v.options);

  revalidatePath("/services");
  revalidatePath(`/services/${v.id}`);
  if (user.handle) {
    revalidatePath(`/${user.handle}`);
    revalidatePath(`/${user.handle}/s/${slug}`);
  }
  return { ok: true, slug };
}

/**
 * เขียนทับ tiers/options ให้ตรงกับที่ส่งมา
 *
 * ตั้งใจ update แถวที่มี id เดิมแทนที่จะลบทิ้งแล้ว insert ใหม่ทั้งหมด —
 * ออเดอร์ใน Phase 1b จะอ้าง tier id ไว้ ถ้า id เปลี่ยนทุกครั้งที่กดบันทึก
 * ประวัติออเดอร์เก่าจะชี้ไปยังแถวที่ไม่มีอยู่แล้ว
 */
async function syncRows(
  serviceId: string,
  tiers: z.infer<typeof TierSchema>[],
  options: z.infer<typeof OptionSchema>[],
) {
  const db = getDb();

  const [oldTiers, oldOptions] = await Promise.all([
    db.query.serviceTier.findMany({
      columns: { id: true },
      where: eq(schema.serviceTier.serviceId, serviceId),
    }),
    db.query.serviceOption.findMany({
      columns: { id: true },
      where: eq(schema.serviceOption.serviceId, serviceId),
    }),
  ]);

  const keptTiers = new Set(tiers.map((t) => t.id).filter(Boolean));
  const keptOptions = new Set(options.map((o) => o.id).filter(Boolean));

  const work: Promise<unknown>[] = [];

  for (const row of oldTiers) {
    if (!keptTiers.has(row.id)) {
      work.push(db.delete(schema.serviceTier).where(eq(schema.serviceTier.id, row.id)));
    }
  }
  for (const row of oldOptions) {
    if (!keptOptions.has(row.id)) {
      work.push(db.delete(schema.serviceOption).where(eq(schema.serviceOption.id, row.id)));
    }
  }

  tiers.forEach((t, i) => {
    const values = { label: t.label, priceDeltaCents: t.priceDeltaCents, sortOrder: i };
    work.push(
      t.id
        ? db.update(schema.serviceTier).set(values).where(eq(schema.serviceTier.id, t.id))
        : db.insert(schema.serviceTier).values({ id: newId("tier"), serviceId, ...values }),
    );
  });

  options.forEach((o, i) => {
    const values = {
      groupLabel: o.groupLabel,
      label: o.label,
      priceDeltaCents: o.priceDeltaCents,
      inputType: o.inputType,
      // เก็บ maxQuantity เฉพาะตอนเป็นแบบเลือกจำนวน — ไม่งั้นค่าค้างจากตอนสลับชนิด
      maxQuantity: o.inputType === "quantity" ? (o.maxQuantity ?? 5) : null,
      sortOrder: i,
    };
    work.push(
      o.id
        ? db.update(schema.serviceOption).set(values).where(eq(schema.serviceOption.id, o.id))
        : db.insert(schema.serviceOption).values({ id: newId("opt"), serviceId, ...values }),
    );
  });

  await Promise.all(work);
}

export async function setServiceCover(serviceId: string, mediaId: string) {
  const { user } = await requireCreator();
  await assertOwned(user.id, serviceId);
  const db = getDb();

  const owned = await db.query.media.findFirst({
    columns: { id: true },
    where: and(eq(schema.media.id, mediaId), eq(schema.media.ownerUserId, user.id)),
  });
  if (!owned) throw new Error("not_found");

  await db
    .update(schema.service)
    .set({ coverMediaId: mediaId, updatedAt: new Date() })
    .where(eq(schema.service.id, serviceId));
  await db.update(schema.media).set({ status: "linked" }).where(eq(schema.media.id, mediaId));

  revalidatePath(`/services/${serviceId}`);
  if (user.handle) revalidatePath(`/${user.handle}`);
}

/**
 * ลบแบบ soft delete — ออเดอร์เก่าอ้างถึง service นี้อยู่ จึงลบแถวจริงไม่ได้
 * slug ถูกปล่อยว่างไว้ให้ชื่อเดิมกลับมาใช้ซ้ำได้ (unique index ครอบ (page, slug))
 */
export async function deleteService(serviceId: string) {
  const { user } = await requireCreator();
  await assertOwned(user.id, serviceId);

  await getDb()
    .update(schema.service)
    .set({
      deletedAt: new Date(),
      isActive: false,
      slug: `deleted-${serviceId}`,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.service.id, serviceId), isNull(schema.service.deletedAt)));

  revalidatePath("/services");
  if (user.handle) revalidatePath(`/${user.handle}`);
  redirect("/services");
}
