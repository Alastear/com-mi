import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

const [users] = await sql`select count(*)::int as n from "user"`;
const [sessions] = await sql`select count(*)::int as n from session`;
const [accounts] = await sql`select count(*)::int as n from account`;

console.log(`users: ${users.n} | sessions: ${sessions.n} | accounts: ${accounts.n}`);
