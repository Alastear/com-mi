import type { Feature } from "@/lib/billing/plans";

export type ReleaseStatus = "planned" | "internal" | "beta" | "live" | "paused";
export type CapabilityDefinition = Readonly<{
  roadmap: string;
  implemented: boolean;
  status: ReleaseStatus;
  /** null = no paid entitlement; ownership, release and quotas still apply. */
  entitlement: Feature | null;
}>;

/** Public metadata only. Never put account IDs, allowlists or secrets here. */
export const CAPABILITIES = {
  themes: { roadmap: "THM", implemented: false, status: "planned", entitlement: "custom_theme" },
  hide_badge: { roadmap: "BDG", implemented: false, status: "planned", entitlement: "hide_badge" },
  custom_brief: { roadmap: "BRF", implemented: false, status: "planned", entitlement: "custom_form" },
  reference_uploads: { roadmap: "REF", implemented: false, status: "planned", entitlement: null },
  milestones: { roadmap: "MIL", implemented: false, status: "planned", entitlement: "milestones" },
  web_push: { roadmap: "PUSH", implemented: false, status: "planned", entitlement: "push_notifications" },
  discord: { roadmap: "DSC", implemented: false, status: "planned", entitlement: "discord_webhook" },
  listings: { roadmap: "LST", implemented: false, status: "planned", entitlement: null },
  auctions: { roadmap: "AUC", implemented: false, status: "planned", entitlement: "auctions" },
  waitlist: { roadmap: "WTL", implemented: false, status: "planned", entitlement: "waitlist_broadcast" },
  crm: { roadmap: "CRM", implemented: false, status: "planned", entitlement: "crm" },
  analytics: { roadmap: "ANL", implemented: false, status: "planned", entitlement: "analytics" },
  csv_export: { roadmap: "EXP", implemented: false, status: "planned", entitlement: "export" },
} as const satisfies Record<string, CapabilityDefinition>;

export type CapabilityId = keyof typeof CAPABILITIES;
export type CapabilityGroup = readonly CapabilityId[];
export type PublicReleaseStatus = Exclude<ReleaseStatus, "internal">;

/** A promise spanning several capabilities is live only when every part is live. */
export function publicReleaseStatus(definitions: readonly CapabilityDefinition[]): PublicReleaseStatus {
  if (!definitions.length || definitions.some((c) => !c.implemented || c.status === "planned" || c.status === "internal")) return "planned";
  if (definitions.some((c) => c.status === "paused")) return "paused";
  if (definitions.some((c) => c.status === "beta")) return "beta";
  return "live";
}

export function capabilityStatus(ids: CapabilityGroup): PublicReleaseStatus {
  return publicReleaseStatus(ids.map((id) => CAPABILITIES[id]));
}

/** UI hint only; authorization must call the server guard. */
export function capabilityPresentation(capabilities: CapabilityGroup): { capabilities: CapabilityGroup; soon?: true } {
  return { capabilities, ...(capabilityStatus(capabilities) === "live" ? {} : { soon: true as const }) };
}

/** Explicit mapping keeps public promises and navigation attached to the same release. */
export const CAPABILITY_SURFACES = {
  pricing: {
    theme: ["themes"], badge: ["hide_badge"], form: ["custom_brief"], milestone: ["milestones"],
    push: ["web_push"], discord: ["discord"], listing: ["listings"], auction: ["auctions"],
    waitlist: ["waitlist"], crm: ["crm"], analytics: ["analytics", "csv_export"],
  },
  proBullets: { notify: ["web_push", "discord"], auctions: ["auctions"], theme: ["themes"], analytics: ["analytics", "crm"] },
  nav: { "/listings": ["listings", "auctions"], "/clients": ["crm"], "/analytics": ["analytics", "csv_export"] },
  settings: { theme: ["themes"], push: ["web_push"], discord: ["discord"] },
  marketing: { brief: ["custom_brief", "reference_uploads"], notify: ["web_push", "discord"], adopt: ["listings", "auctions"] },
} as const satisfies Record<string, Record<string, CapabilityGroup>>;
