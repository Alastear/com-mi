import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);
const who = process.argv[2];
const r = await sql`update "user" set role = 'admin' where email = ${who} or handle = ${who} returning email, role`;
if (!r.length) { console.log(`  ไม่เจอผู้ใช้ ${who}`); process.exit(1); }
for (const x of r) console.log(`  ${x.email} → role=${x.role}`);
