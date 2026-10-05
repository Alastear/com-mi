import { createHash } from "node:crypto";

/** IDs derive only from a validated run ID; no database rows or user input become SQL identifiers. */
export function fixtureManifest(runId: string) {
  if (!/^[a-z0-9][a-z0-9-]{7,31}$/.test(runId)) throw new Error("Run ID must be 8–32 lowercase letters, digits or hyphens.");
  const prefix = `qa_${runId}`;
  const users = ["creator-th", "creator-en", "client-th", "client-en"].map((role, i) => ({
    id: `${prefix}_${role}`, email: `${prefix}_${role}@example.invalid`,
    handle: i < 2 ? `qa-${createHash("sha256").update(`${runId}:${i}`).digest("hex").slice(0, 16)}` : null,
    name: i % 2 ? `QA ${role}` : `ทดสอบ ${role}`, locale: i % 2 ? "en" : "th",
  }));
  const shops = users.slice(0, 2).map((user, i) => ({ id: `${prefix}_shop${i}`, userId: user.id, name: user.name }));
  const services = shops.map((shop, i) => ({ id: `${prefix}_service${i}`, shopId: shop.id, title: i ? "QA illustration" : "ภาพวาดทดสอบ" }));
  const orders = shops.flatMap((shop, i) => ["requested", "accepted", "in_progress", "in_review"].map((status, j) => ({
    id: `${prefix}_order${i}${j}`, shopId: shop.id, serviceId: services[i].id,
    clientId: users[2 + j % 2].id, status,
    code: Array.from(createHash("sha256").update(`${runId}:${i}:${j}`).digest().subarray(0, 8), byte => "23456789ABCDEFGHJKMNPQRSTUVWXYZ"[byte % 30]).join(""),
    itemId: `${prefix}_item${i}${j}`, messageId: `${prefix}_message${i}${j}`,
  })));
  return { version: 1, runId, users, shops, services, orders };
}
