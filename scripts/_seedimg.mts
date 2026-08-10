import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);
const any = await sql`select id, kind, url from media where url is not null limit 3`;
console.log("  รูปที่มีในระบบ:", any.map(x=>`${x.kind}`).join(", ") || "(ไม่มีเลย)");
const url = any[0]?.url ?? "https://placehold.co/1600x400/png";
const u = (await sql`select id from "user" where handle='e2etester'`)[0];
const p = (await sql`select id from creator_page where user_id=${u.id}`)[0];
for (const [id, kind] of [["med_focaltest_bn","banner"],["med_focaltest_av","avatar"]]) {
  await sql`delete from media where id=${id}`;
  await sql`insert into media (id, owner_user_id, pathname, url, access, kind, content_type, bytes, status, focal_x, focal_y)
    values (${id}, ${u.id}, ${'test/'+id}, ${url}, 'public', ${kind}, 'image/webp', 1000, 'linked',
            ${kind==='banner'?30:70}, ${kind==='banner'?80:20})`;
}
await sql`update creator_page set banner_media_id='med_focaltest_bn', avatar_media_id='med_focaltest_av' where id=${p.id}`;
console.log("  ใส่แบนเนอร์ 30/80 และอวาตาร์ 70/20 ให้ e2etester แล้ว");
