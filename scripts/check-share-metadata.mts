import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { fixtureManifest } from "../lib/environment/fixture-manifest";
import { requireFixtureEnvironment } from "./fixture-environment.mjs";

const { env, args } = await requireFixtureEnvironment();
assert.equal(args.length, 1);
const f = fixtureManifest(args[0]);
const origin = new URL(env.NEXT_PUBLIC_APP_URL!).origin;
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const db = neon(env.DATABASE_URL!);
const shop = f.shops[0], owner = f.users[0], service = f.services[0];
assert.equal((await db`select 1 from creator_page where id=${shop.id} and user_id=${owner.id} and is_demo=true and is_published=false and avatar_media_id is null`).length, 1);
const mediaIds = [`qa_share_avatar_${args[0]}`, `qa_share_cover_${args[0]}`];
const fallback = `${origin}/share-image`, avatar = `${fallback}?qa=avatar`, cover = `${fallback}?qa=cover`, google = `${fallback}?qa=google-profile`;
const path = `/@${owner.handle}`, servicePath = `${path}/s/qa-illustration`;
async function html(pathname: string, bot = "Twitterbot/1.0") {
  const res = await fetch(`${origin}${pathname}`, { headers: { "user-agent": bot } });
  return { status: res.status, text: await res.text() };
}
function meta(text: string, key: string) {
  const tag = text.match(new RegExp(`<meta (?:property|name)="${key}"[^>]*>`))?.[0];
  return tag?.match(/content="([^"]*)"/)?.[1].replaceAll("&amp;", "&");
}
async function check(pathname: string, expected: string) {
  for (const bot of ["Twitterbot/1.0", "facebookexternalhit/1.1"]) {
    const response = await html(pathname, bot); assert.equal(response.status, 200);
    assert.equal(meta(response.text, "og:image"), expected);
    assert.equal(meta(response.text, "twitter:image"), expected);
    assert.equal(meta(response.text, "og:url"), `${origin}${pathname}`);
  }
}
try {
  const image = await fetch(fallback); assert.equal(image.status, 200); assert.match(image.headers.get("content-type") ?? "", /image\/png/);
  assert.ok((await image.arrayBuffer()).byteLength > 1000);
  await db`update creator_page set is_published=true where id=${shop.id}`;
  await check(path, fallback); console.log("PASS generic fallback and PNG endpoint");
  await db`update "user" set image=${google} where id=${owner.id} and email=${owner.email}`;
  await check(path, google); await check(servicePath, google); console.log("PASS owner profile fallback on shop and service");
  for (let i=0; i<mediaIds.length; i++) await db`insert into media(id,owner_user_id,pathname,url,kind,content_type,access) values(${mediaIds[i]},${owner.id},${`qa-metadata/${mediaIds[i]}`},${i ? cover : avatar},${i ? "service_cover" : "avatar"},'image/png','public')`;
  await db`update creator_page set avatar_media_id=${mediaIds[0]} where id=${shop.id}`;
  await check(path, avatar); await check(servicePath, avatar); console.log("PASS shop avatar takes precedence over owner profile");
  await db`update service set cover_media_id=${mediaIds[1]} where id=${service.id} and creator_page_id=${shop.id}`;
  await check(servicePath, cover); await check(path, avatar); console.log("PASS service cover is specific to its own link for both crawlers");
  await db`update creator_page set is_published=false where id=${shop.id}`;
  for (const pathname of [path,servicePath]) {
    const response=await html(pathname); assert.equal(response.status,404);
    assert.notEqual(meta(response.text,"og:image"),avatar); assert.notEqual(meta(response.text,"og:image"),cover);
    assert.ok(!response.text.includes(`content="${owner.name}`));
  }
  console.log("PASS unpublished shop and service do not expose private share metadata");
} finally {
  // These DB-only media rows reference the local fallback endpoint, not uploaded objects.
  await db`delete from media where id=any(${mediaIds}::text[]) and owner_user_id=${owner.id}`;
  await db`update creator_page set is_published=false where id=${shop.id} and user_id=${owner.id}`;
  await db`update "user" set image=null where id=${owner.id} and email=${owner.email}`;
  console.log("Metadata fixture restored; run fixture clean next.");
}
