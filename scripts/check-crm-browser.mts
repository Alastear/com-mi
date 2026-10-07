import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { neon } from "@neondatabase/serverless";
import { makeSignature } from "better-auth/crypto";
import { fixtureManifest } from "../lib/environment/fixture-manifest";
import { requireFixtureEnvironment } from "./fixture-environment.mjs";

// Run against a local app with outbound email disabled, after creating a fresh fixture.
// PLAYWRIGHT_MODULE may point to an existing installation; no browser download is performed.
const { env, args } = await requireFixtureEnvironment();
assert.equal(args.length, 1, "Expected one fresh fixture run ID");
const origin = new URL(env.NEXT_PUBLIC_APP_URL!).origin;
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "Local browser QA only");
const require = createRequire(import.meta.url);
const { chromium, expect } = require(process.env.PLAYWRIGHT_MODULE || "playwright/test");
const f = fixtureManifest(args[0]);
const db = neon(env.DATABASE_URL!);
const actor = f.users[0];
const shops = f.shops.map(s => s.id);
const output = resolve(process.env.CRM_QA_OUTPUT || resolve(tmpdir(), "com-mi-crm-qa", f.runId));
await mkdir(output, { recursive: true });
// Do not change an existing rollout or existing cohort membership.
assert.equal((await db`select 1 from capability_rollout where capability='crm'`).length, 0, "Existing rollout: use a separate test DB");
assert.equal((await db`select 1 from capability_cohort where capability='crm'`).length, 0, "Existing cohorts: use a separate test DB");
assert.equal((await db`select 1 from capability_audit where capability='crm'`).length, 0, "Existing audit history: use a separate test DB");
for (const u of f.users) {
  const rows = await db`select role from "user" where id=${u.id} and email=${u.email}`;
  assert.equal(rows.length, 1); assert.equal(rows[0].role, "user");
}
assert.equal((await db`select 1 from client_profile where creator_page_id=any(${shops}::text[])`).length, 0, "Fresh fixture required");
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const failures: string[] = [];
const sessionIds: string[] = [];
async function check(label: string, fn: () => Promise<void>) { await fn(); console.log(`PASS ${label}`); }
async function newContext(index: number, locale = "en") {
  const token = randomUUID(); const id = `qa_browser_${randomUUID()}`; sessionIds.push(id);
  await db`insert into session(id,user_id,token,expires_at) values(${id},${f.users[index].id},${token},${new Date(Date.now()+3600000).toISOString()})`;
  const context = await browser.newContext({ locale, viewport: { width: 1280, height: 900 } });
  await context.addCookies([
    { name: "better-auth.session_token", value: `${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET!)}`, url: origin, httpOnly: true, sameSite: "Lax" },
    { name: "locale", value: locale, url: origin },
  ]);
  // The optional Playwright package is loaded from an operator-supplied installation.
  context.on("page", (page: { on: (event: string, callback: () => void) => void }) => page.on("pageerror", () => failures.push("browser pageerror")));
  return context;
}
try {
  const anon = await browser.newPage();
  await check("anonymous CRM redirects to sign-in", async () => { await anon.goto(`${origin}/clients`); assert.match(anon.url(), /\/sign-in/); });
  const a = await newContext(0); const b = await newContext(1); const c = await newContext(2);
  const owner = await a.newPage(); const other = await b.newPage(); const client = await c.newPage();
  await check("planned CRM remains closed", async () => { await owner.goto(`${origin}/clients`); await expect(owner.getByText("Not available yet", { exact: true })).toBeVisible(); });
  await check("non-admin cannot open rollout controls", async () => { await other.goto(`${origin}/admin/rollouts`); await expect(other.getByRole("heading", { name: "CRM rollout" })).toHaveCount(0); });
  await db`update "user" set role='admin' where id=${actor.id} and email=${actor.email}`;
  const admin = await a.newPage(); await admin.goto(`${origin}/admin/rollouts`);
  async function release(value: string) {
    await admin.reload(); const form = admin.locator("form").filter({ has: admin.getByText("CRM release status", { exact: true }) });
    await form.locator("select").selectOption(value); await form.locator('[name="reason"]').fill(`Browser QA ${f.runId}`);
    await form.getByRole("button", { name: "Save access change" }).click();
    await expect(admin.getByText(`Current status: ${value}`, { exact: true })).toBeVisible();
  }
  async function addShop(index: number) {
    const form = admin.locator("form").filter({ has: admin.getByText("Add a pilot shop", { exact: true }) });
    await form.locator('[name="shop"]').fill(f.shops[index].id); await form.locator('[name="reason"]').fill(`Browser QA ${f.runId}`);
    await form.getByRole("button", { name: "Save access change" }).click();
    await expect(admin.getByText(f.shops[index].id, { exact: true })).toBeVisible();
  }
  await check("admin release and cohort actions persist with audit", async () => { await release("beta"); await addShop(0); await addShop(1); assert.equal((await db`select 1 from capability_audit where actor_user_id=${actor.id}`).length, 3); });
  const detail = `${origin}/clients/${f.users[2].id}`;
  await check("client list, search and own order history", async () => {
    await owner.goto(`${origin}/clients`); await expect(owner.getByRole("link", { name: new RegExp(f.users[2].name) })).toBeVisible();
    await owner.getByLabel("Search client name").fill("no-such-qa-client"); await owner.getByRole("button", { name: "Search", exact: true }).click(); await expect(owner.getByText("No clients found.")).toBeVisible();
    await owner.goto(detail); await expect(owner.locator("#client-note")).toBeVisible();
    for (const order of f.orders.filter(o => o.shopId===f.shops[0].id && o.clientId===f.users[2].id)) await expect(owner.getByRole("link", { name: `#${order.code}` })).toBeVisible();
  });
  const stale = await a.newPage(); await stale.goto(detail);
  const note = `Private note ${f.runId} / โน้ตส่วนตัว`;
  await check("save notes and tags through the real Server Action", async () => {
    await owner.locator("#client-note").fill(note); await owner.locator("#client-tags").fill("repeat-client, ไทย");
    await owner.getByRole("button", { name: "Save", exact: true }).click(); await expect(owner.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await owner.reload(); await expect(owner.locator("#client-note")).toHaveValue(note);
  });
  await check("tag validation rejects eleven tags and keyboard submission works", async () => {
    await owner.locator("#client-tags").fill(Array.from({ length: 11 }, (_, i) => `tag${i}`).join(","));
    await owner.locator("#client-tags").press("Enter"); await expect(owner.getByText(/Could not save/)).toBeVisible();
    await owner.locator("#client-tags").fill("repeat-client, ไทย"); await owner.locator("#client-tags").press("Tab");
    await expect(owner.getByRole("button", { name: "Save", exact: true })).toBeFocused();
    await owner.keyboard.press("Enter"); await expect(owner.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await owner.screenshot({ path: `${output}/crm-desktop-en.png`, fullPage: true });
  });
  await check("stale tab preserves draft and blocks overwrite", async () => {
    await stale.locator("#client-note").fill("stale draft"); await stale.getByRole("button", { name: "Save", exact: true }).click();
    await expect(stale.getByText(/This profile changed in another tab/)).toBeVisible(); await expect(stale.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await expect(stale.locator("#client-note")).toHaveValue("stale draft"); await stale.getByRole("button", { name: "Load latest" }).click(); await expect(stale.locator("#client-note")).toHaveValue(note);
  });
  await check("private notes are isolated between shops and hidden from client", async () => {
    await other.goto(detail); await expect(other.locator("#client-note")).toHaveValue("");
    await client.goto(detail); await expect(client.locator("#client-note")).toHaveCount(0); assert.ok(!(await client.locator("body").innerText()).includes(note));
    await owner.goto(`${origin}/clients/${f.users[1].id}`); await expect(owner.locator("#client-note")).toHaveCount(0);
  });
  await owner.goto(detail);
  await check("mobile TH, dark theme and no horizontal overflow", async () => {
    await a.addCookies([{ name: "locale", value: "th", url: origin }]); await owner.setViewportSize({ width: 390, height: 844 }); await owner.reload();
    await expect(owner.getByRole("heading", { name: "ข้อมูลส่วนตัวของร้าน" })).toBeVisible();
    assert.ok(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await owner.screenshot({ path: `${output}/crm-mobile-th.png`, fullPage: true });
    await owner.evaluate(() => { localStorage.setItem("theme", "dark"); }); await owner.reload();
    await expect(owner.locator("html")).toHaveClass(/dark/);
    await owner.screenshot({ path: `${output}/crm-mobile-dark.png`, fullPage: true });
    await a.addCookies([{ name: "locale", value: "en", url: origin }]); await owner.reload();
  });
  await check("revoked cohort blocks stale editor and preserves owned read access", async () => {
    await release("beta"); await owner.reload(); await expect(owner.locator("#client-note")).toBeVisible();
    const form = admin.locator("form").filter({ has: admin.getByText(f.shops[0].id, { exact: true }) });
    await form.locator("select").selectOption("revoked"); await form.locator('[name="reason"]').fill(`Browser QA ${f.runId}`);
    await form.getByRole("button", { name: "Save access change" }).click();
    await expect(form.locator("select")).toHaveValue("revoked");
    // Wait for the persisted revocation rather than the optimistic select value.
    await expect.poll(async () => (await db`select cohort from capability_cohort where capability='crm' and creator_page_id=${f.shops[0].id}`)[0].cohort).toBe("revoked");
    await owner.locator("#client-note").fill("revoked draft must not persist"); await owner.getByRole("button", { name: "Save", exact: true }).click();
    await expect(owner.getByText(/Could not save/)).toBeVisible();
    await owner.reload(); await expect(owner.getByText(note, { exact: true })).toBeVisible(); await expect(owner.locator("#client-note")).toHaveCount(0);
    await form.locator("select").selectOption("beta"); await form.locator('[name="reason"]').fill(`Browser QA ${f.runId}`);
    await form.getByRole("button", { name: "Save access change" }).click();
    await expect.poll(async () => (await db`select cohort from capability_cohort where capability='crm' and creator_page_id=${f.shops[0].id}`)[0].cohort).toBe("beta");
    await owner.reload(); await expect(owner.locator("#client-note")).toBeVisible();
  });
  await check("pause blocks a previously opened editor and retains read-only notes", async () => {
    await release("paused"); await owner.locator("#client-note").fill("must not persist"); await owner.getByRole("button", { name: "Save", exact: true }).click();
    await expect(owner.getByText(/Could not save/)).toBeVisible();
    assert.equal((await db`select note from client_profile where creator_page_id=${f.shops[0].id} and client_user_id=${f.users[2].id}`)[0].note, note);
    await owner.reload(); await expect(owner.getByRole("heading", { name: "Private notes and tags (read only)" })).toBeVisible(); await expect(owner.getByText(note, { exact: true })).toBeVisible();
  });
  await check("revoked admin role is enforced with an existing session", async () => {
    await db`update "user" set role='user' where id=${actor.id}`; await admin.reload(); await expect(admin.getByRole("heading", { name: "CRM rollout" })).toHaveCount(0);
  });
  assert.deepEqual(failures, []); console.log("PASS no browser runtime errors");
} finally {
  await browser.close();
  await db.transaction([
    db`delete from session where id=any(${sessionIds}::text[])`,
    db`update "user" set role='user' where id=${actor.id} and email=${actor.email}`,
  ]);
  await db.transaction([
    db`delete from capability_audit where actor_user_id=${actor.id} and reason=${`Browser QA ${f.runId}`}`,
    db`delete from capability_cohort where capability='crm' and creator_page_id=any(${shops}::text[])`,
    // Refuse to erase rollout settings if another actor changed them during QA.
    db`select 1 / case when exists(select 1 from capability_audit where capability='crm') then 0 else 1 end`,
    db`delete from capability_rollout where capability='crm'`,
  ]);
  console.log("RESTORED rollout, fixture role and temporary sessions; run fixture clean next.");
}
