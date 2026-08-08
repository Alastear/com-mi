/**
 * สลับโดเมนหลักของ production
 *
 * `NEXT_PUBLIC_APP_URL` กับ `BETTER_AUTH_URL` ต้องเปลี่ยน **พร้อมกัน**
 * ถ้าเปลี่ยนแค่ตัวเดียวจะได้สถานะที่แย่กว่าไม่เปลี่ยนเลย: ผู้ใช้เปิดโดเมนใหม่
 * กดเข้าสู่ระบบ แล้ว Google ส่งกลับไปโดเมนเก่า คุกกี้ไปตกที่โดเมนเก่า —
 * โดเมนใหม่จึงยังขึ้นว่ายังไม่ได้ล็อกอินทั้งที่เพิ่งล็อกอินสำเร็จ
 *
 * ⚠️ ต้องเพิ่ม redirect URI ใน Google Cloud **ก่อน** รันตัวนี้:
 *      https://<โดเมนใหม่>/api/auth/callback/google
 *    ไม่งั้นล็อกอินด้วย Google จะพังทันทีที่ deploy รอบถัดไปขึ้น
 *
 *   pnpm domain:switch https://com-mi.poruyrai.xyz
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECT = "prj_ZIFcZznXtK3ZYOXmv56toKb8BYhm";
const TEAM = "team_YvcXuF5fC3GMReqflhlEJwa6";

const target = process.argv[2];
if (!target || !/^https:\/\/[a-z0-9.-]+$/i.test(target)) {
  console.error("ใช้: pnpm domain:switch https://com-mi.poruyrai.xyz");
  process.exit(1);
}

const authPath = join(homedir(), "Library/Application Support/com.vercel.cli/auth.json");
const token = JSON.parse(readFileSync(authPath, "utf8")).token as string;

const api = async (path: string, init?: RequestInit) => {
  const res = await fetch(`https://api.vercel.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body as Record<string, unknown>;
};

const { envs } = (await api(`/v10/projects/${PROJECT}/env?teamId=${TEAM}`)) as {
  envs: { id: string; key: string; target: string[] }[];
};

for (const key of ["NEXT_PUBLIC_APP_URL", "BETTER_AUTH_URL"]) {
  const row = envs.find((e) => e.key === key && e.target.includes("production"));
  if (!row) {
    console.error(`ไม่เจอ ${key} ใน production — ตั้งด้วยมือก่อน`);
    process.exit(1);
  }
  await api(`/v10/projects/${PROJECT}/env/${row.id}?teamId=${TEAM}`, {
    method: "PATCH",
    body: JSON.stringify({ value: target }),
  });
  console.log(`  ${key} → ${target}`);
}

console.log("\nเปลี่ยนแล้ว — ต้อง deploy ใหม่ค่า env ถึงจะมีผล (push หรือ vercel --prod)");
console.log("อย่าลืมตรวจว่า Google Cloud มี redirect URI นี้แล้ว:");
console.log(`  ${target}/api/auth/callback/google`);
