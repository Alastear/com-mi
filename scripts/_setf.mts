import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);
await sql`update media set focal_x=30, focal_y=80 where id='med_focaltest_bn'`;
await sql`update media set focal_x=70, focal_y=20 where id='med_focaltest_av'`;
console.log("  ตั้งแบนเนอร์ 30/80 · อวาตาร์ 70/20");
