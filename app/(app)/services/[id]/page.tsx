import { notFound } from "next/navigation";
import { requireCreator } from "@/lib/auth-guard";
import { getOwnService } from "@/lib/queries/creator";
import { ServiceEditor } from "./service-editor";

export default async function EditServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireCreator();

  const svc = await getOwnService(user.id, id);
  if (!svc) notFound();

  return (
    <ServiceEditor
      handle={user.handle ?? ""}
      service={{
        id: svc.id,
        title: svc.title,
        description: svc.description,
        slug: svc.slug,
        kind: svc.kind,
        mode: svc.mode,
        basePriceCents: svc.basePriceCents,
        deliveryDays: svc.deliveryDays,
        revisionsIncluded: svc.revisionsIncluded,
        includes: svc.includes,
        isActive: svc.isActive,
        coverUrl: svc.cover?.url ?? null,
        tiers: svc.tiers.map((t) => ({
          id: t.id,
          label: t.label,
          priceDeltaCents: t.priceDeltaCents,
        })),
        options: svc.options.map((o) => ({
          id: o.id,
          groupLabel: o.groupLabel,
          label: o.label,
          priceDeltaCents: o.priceDeltaCents,
          inputType: o.inputType === "quantity" ? "quantity" : "checkbox",
          maxQuantity: o.maxQuantity,
        })),
      }}
    />
  );
}
