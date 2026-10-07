import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { neon } from "@neondatabase/serverless";
import { makeSignature } from "better-auth/crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import { fixtureManifest } from "../lib/environment/fixture-manifest";
import { requireFixtureEnvironment } from "./fixture-environment.mjs";
import { clientListSql, clientOrdersSql } from "../lib/clients/sql";
import { clientFilters } from "../lib/clients/filters";
import { S3Client, DeleteObjectsCommand, AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Fresh, disposable fixtures only. This tests records, never transfers funds.
const { env, args } = await requireFixtureEnvironment();
assert.equal(args.length, 1);
const f = fixtureManifest(args[0]); const order = f.orders[2];
const origin = new URL(env.NEXT_PUBLIC_APP_URL!).origin;
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const db = neon(env.DATABASE_URL!);
const { chromium, expect } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright/test");
for (const u of f.users) assert.equal((await db`select 1 from "user" where id=${u.id} and email=${u.email}`).length, 1);
assert.equal((await db`select 1 from payment_record where order_id=any(${f.orders.map(o => o.id)}::text[])`).length, 0, "Use a fresh fixture");
assert.equal((await db`select 1 from "order" where id=${order.id} and creator_page_id=${order.shopId} and client_user_id=${order.clientId} and status='in_progress' and amount_paid_cents=0`).length, 1);
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const sessionIds: string[] = []; const errors: string[] = [];
async function pageFor(index: number) {
  const token = randomUUID(); const id = `qa_pay_${randomUUID()}`; sessionIds.push(id);
  await db`insert into session(id,user_id,token,expires_at) values(${id},${f.users[index].id},${token},${new Date(Date.now()+3600000).toISOString()})`;
  const context = await browser.newContext({ locale: "en" });
  await context.addCookies([{ name: "better-auth.session_token", value: `${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET!)}`, url: origin, httpOnly: true }, { name: "locale", value: "en", url: origin }]);
  const page = await context.newPage(); page.on("pageerror", () => errors.push("pageerror")); return page;
}
const paid = async () => (await db`select amount_paid_cents from "order" where id=${order.id}`)[0].amount_paid_cents;
async function pending(amount: number, method: string) {
  const id = `qa_pay_${randomUUID()}`;
  await db`insert into payment_record(id,order_id,amount_cents,method) values(${id},${order.id},${amount},${method})`; return id;
}
try {
  await db`update "order" set deposit_cents=30000 where id=${order.id}`;
  const owner = await pageFor(0); const client = await pageFor(2); const other = await pageFor(1);
  owner.on("console", (message: { type: () => string; text: () => string }) => { if(message.type()==="error") console.log("Browser error:",message.text().replace(/https?:\/\/\S+/g,"[URL]").slice(0,350)); });
  owner.on("response", (response: { status: () => number; url: () => string }) => { if(response.status()>=400) console.log("HTTP failure:",response.status(),new URL(response.url()).hostname); });
  const url = `${origin}/orders/${order.code}`;
  await owner.goto(url);
  await owner.getByRole("button", { name: "Record a payment I received", exact: true }).click();
  await owner.locator("#record-amount").fill("300"); await owner.getByRole("button", { name: "Record payment", exact: true }).click();
  await expect.poll(paid).toBe(30000); console.log("PASS real creator deposit action updates ledger and order total");
  await owner.reload(); await owner.getByRole("button", { name: "Undo confirmation", exact: true }).click();
  await owner.getByRole("textbox", { name: "Reason (the client sees it)", exact: true }).fill("QA mistaken confirmation");
  await owner.getByRole("button", { name: "Undo the confirmation", exact: true }).click();
  await expect.poll(paid).toBe(0); console.log("PASS void confirmation removes counted amount");
  const bank = await pending(20000, "bank_transfer"); await owner.reload();
  await owner.getByRole("button", { name: "Confirm the money arrived in my account", exact: true }).click();
  await expect.poll(paid).toBe(20000); assert.ok((await db`select verified_at from payment_record where id=${bank}`)[0].verified_at);
  console.log("PASS bank-transfer confirmation counts once");
  const wallet = await pending(10000, "true_wallet"); await owner.reload();
  await owner.getByRole("button", { name: "Not received", exact: true }).click();
  await owner.getByRole("button", { name: "Mark as not received", exact: true }).click();
  await expect.poll(async () => !!(await db`select rejected_at from payment_record where id=${wallet}`)[0].rejected_at).toBe(true);
  assert.equal(await paid(), 20000); console.log("PASS rejected wallet report does not count as payment");
  await db`update "order" set deposit_cents=20000 where id=${order.id}`;
  await client.goto(`${origin}/my/requests/${order.code}`);
  await expect(client.getByText("Review and approve the preview before reporting the final payment.", { exact: true })).toBeVisible();
  await expect(client.getByRole("button", { name: "I have paid", exact: true })).toHaveCount(0);
  await pending(80000, "bank_transfer"); await owner.reload();
  await expect(owner.getByRole("button", { name: "Confirm the money arrived in my account", exact: true })).toBeDisabled();
  assert.equal(await paid(), 20000); console.log("PASS final-payment report and confirmation blocked before client preview approval");
  await other.goto(url); await expect(other.getByRole("button", { name: "Confirm the money arrived in my account", exact: true })).toHaveCount(0);
  console.log("PASS other shop cannot access order payment controls");
  // Exercise the actual CRM query with multiple rows, pending/rejected/voided states and foreign currency.
  await db`update "order" set currency='USD' where id=${f.orders[0].id}`;
  await db`insert into payment_record(id,order_id,amount_cents,verified_at) values(${`qa_pay_${randomUUID()}`},${f.orders[0].id},12300,now())`;
  const dialect = new PgDialect();
  const listQuery = dialect.sqlToQuery(clientListSql(f.shops[0].id, clientFilters({})));
  const rows = await db.query(listQuery.sql, listQuery.params); const row = rows.find(r => r.id===f.users[2].id);
  assert.equal(row?.orders, 2); assert.equal(row?.received, "20000");
  const historyQuery = dialect.sqlToQuery(clientOrdersSql(f.shops[0].id, f.users[2].id, 0));
  const history = await db.query(historyQuery.sql, historyQuery.params);
  assert.equal(history.find(r => r.code===f.orders[0].code)?.received, "12300");
  assert.equal(history.find(r => r.code===order.code)?.received, "20000");
  console.log("PASS CRM receipt totals exclude pending/rejected/voided, avoid duplicate order counts, separate currencies");
  // Real private upload -> watermarked preview -> client approval -> payment -> release -> download.
  await db`update "order" set status='in_review' where id=${order.id}`;
  await owner.reload();
  const png = Buffer.from(await owner.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width=600; canvas.height=400;
    const ctx=canvas.getContext("2d")!; ctx.fillStyle="#d9c7ff"; ctx.fillRect(0,0,600,400);
    ctx.fillStyle="#34154a"; ctx.font="40px sans-serif"; ctx.fillText("QA TEST ART",100,200);
    return canvas.toDataURL("image/png").split(",")[1];
  }), "base64");
  await owner.locator('#work-previews input[type="file"]').setInputFiles({ name:"qa-preview.png", mimeType:"image/png", buffer:png });
  await expect(owner.getByText("Watermarked preview sent",{exact:true})).toBeVisible({timeout:60000});
  await expect.poll(async () => (await db`select count(*)::int as n from media where order_id=${order.id} and kind='wip' and is_watermarked=true`)[0].n, { timeout:60000 }).toBe(1);
  await client.reload(); await expect(client.locator("#work-previews img")).toBeVisible();
  await expect.poll(async () => client.locator("#work-previews img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth>0)).toBe(true);
  const output=join(tmpdir(),"com-mi-payment-qa"); await mkdir(output,{recursive:true});
  await client.locator("#work-previews").screenshot({path:join(output,"watermarked-preview.png")});
  await client.getByRole("button",{name:"Approve latest preview",exact:true}).click();
  await expect(client.getByRole("dialog")).toBeVisible();
  await client.getByRole("dialog").getByRole("button",{name:"Cancel",exact:true}).click();
  assert.equal((await db`select approved_preview_id from "order" where id=${order.id}`)[0].approved_preview_id,null);
  await client.getByRole("button",{name:"Approve latest preview",exact:true}).click();
  await client.getByRole("dialog").getByRole("button",{name:"Approve work",exact:true}).click();
  await expect.poll(async () => !!(await db`select approved_preview_id from "order" where id=${order.id}`)[0].approved_preview_id).toBe(true);
  console.log("PASS private watermarked preview renders, approval dialog cancellation preserves state, client approval persists");
  await owner.reload(); await owner.getByRole("button",{name:"Confirm the money arrived in my account",exact:true}).click();
  await expect.poll(paid).toBe(100000); console.log("PASS final payment becomes confirmable after real client preview approval");
  const filename="qa-final-illustration-with-a-long-filename-for-mobile-layout.png";
  await owner.locator(`#delivery-${order.code}`).setInputFiles({name:filename,mimeType:"image/png",buffer:png});
  await expect(owner.getByRole("button",{name:"Prepare delivery",exact:true})).toBeEnabled({timeout:60000});
  await owner.getByRole("button",{name:"Prepare delivery",exact:true}).click();
  await expect(owner.getByRole("button",{name:"Deliver to the client",exact:true})).toBeEnabled();
  await client.reload(); await expect(client.getByRole("button",{name:"Download",exact:true})).toHaveCount(0);
  await owner.getByRole("button",{name:"Deliver to the client",exact:true}).click();
  await expect.poll(async () => (await db`select status from "order" where id=${order.id}`)[0].status).toBe("delivered");
  await client.reload(); await client.setViewportSize({width:390,height:844});
  await expect(client.getByRole("button",{name:"Download",exact:true})).toBeVisible();
  assert.ok(await client.evaluate(() => document.documentElement.scrollWidth<=innerWidth));
  await client.screenshot({path:join(output,"delivery-mobile.png"),fullPage:true});
  const downloadPromise=client.waitForEvent("download"); await client.getByRole("button",{name:"Download",exact:true}).click();
  const download=await downloadPromise; assert.equal(download.suggestedFilename(),filename);
  const downloadedPath=await download.path(); assert.ok(downloadedPath); assert.deepEqual(await readFile(downloadedPath),png);
  await other.reload(); await expect(other.getByRole("button",{name:"Download",exact:true})).toHaveCount(0);
  console.log("PASS private delivery upload, locked before release, mobile layout and exact original-byte download; other shop denied");
  assert.deepEqual(errors, []); console.log("PASS no browser runtime errors");
} finally {
  await browser.close(); await db`delete from session where id=any(${sessionIds}::text[])`;
  const objects=await db`select pathname as key from media where order_id=${order.id} and owner_user_id=${f.users[0].id}`;
  const intents=await db`select key,upload_id from upload_intent where order_id=${order.id} and user_id=${f.users[0].id}`;
  const storage=new S3Client({region:"auto",endpoint:`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env.R2_PRIVATE_ACCESS_KEY_ID!,secretAccessKey:env.R2_PRIVATE_SECRET_ACCESS_KEY!}});
  for (const intent of intents) if (intent.upload_id) {
    try { await storage.send(new AbortMultipartUploadCommand({Bucket:env.R2_PRIVATE_BUCKET,Key:intent.key,UploadId:intent.upload_id})); }
    catch(error) { if (!(error instanceof Error && error.name==="NoSuchUpload")) throw error; }
  }
  const keys=[...new Set([...objects.map(o=>o.key),...intents.map(i=>i.key)])];
  if(keys.length) { const result=await storage.send(new DeleteObjectsCommand({Bucket:env.R2_PRIVATE_BUCKET,Delete:{Objects:keys.map(Key=>({Key}))}})); assert.ok(!result.Errors?.length,"Test object cleanup failed"); }
  await db.transaction([db`delete from media where order_id=${order.id} and owner_user_id=${f.users[0].id}`,db`delete from upload_intent where order_id=${order.id} and user_id=${f.users[0].id}`]);
  storage.destroy();
  console.log("Temporary sessions removed. Run fixture clean to remove all test orders and payment records.");
}
