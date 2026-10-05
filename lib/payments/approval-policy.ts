import type { OrderStatus } from "@/lib/types";

/** Client reports are required for the balance after the deposit. */
export function mayRecordDeposit(paidCents: number, depositCents: number, amountCents: number): boolean {
  return Number.isInteger(amountCents) && amountCents > 0 && depositCents > 0 && paidCents + amountCents <= depositCents;
}

/** Upfront payments remain possible; active work's final payment needs approval. */
export function needsWorkApproval(status: OrderStatus | string, approvedPreviewId: string | null, paidCents: number, amountCents: number, totalCents: number): boolean {
  return ["in_progress", "in_review", "revision_requested"].includes(status) && !approvedPreviewId && paidCents + amountCents >= totalCents;
}
