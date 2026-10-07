import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyRegisterResult,
  INTENT_SAFETY_MS,
  nextRegisterDelay,
  REGISTER_RETRY_WINDOW_MS,
  registerWithRetry,
  STALE_CLAIM_MS,
  type RegisterCallResult,
  type RegisterStatus,
} from "./register-retry";

const HOUR = 60 * 60 * 1000;

it("a hung response returns unconfirmed without deleting an upload that later commits", async () => {
  let finish!: (value: RegisterCallResult) => void;
  let cancels=0; let calls=0;
  const result=await registerWithRetry({
    call:()=>{calls++;return new Promise<RegisterCallResult>(resolve=>{finish=resolve;});},
    now:Date.now,sleep:async()=>{},isOnline:()=>true,waitOnline:async()=>{},
    expiresAt:Date.now()+HOUR,onHardFailure:()=>{cancels++;},callTimeoutMs:5,
  });
  assert.deepEqual(result,{ok:false,error:"unconfirmed"}); assert.equal(calls,1); assert.equal(cancels,0);
  finish({ok:true}); await Promise.resolve(); assert.equal(cancels,0);
});

/** จำลองนาฬิกา — sleep กับ waitOnline แค่เลื่อนเวลา ไม่ได้รอจริง */
function harness(opts: {
  answers: (attempt: number, now: number) => RegisterCallResult | "throw";
  expiresInMs?: number;
  offline?: (now: number) => boolean;
  /** ถ้าออฟไลน์ กลับมาออนไลน์ตอนไหน */
  onlineAt?: number;
}) {
  let now = 0;
  let calls = 0;
  let cancels = 0;
  const statuses: RegisterStatus[] = [];
  const run = registerWithRetry({
    call: async () => {
      calls++;
      const a = opts.answers(calls, now);
      if (a === "throw") throw new Error("An error occurred in the Server Components render.");
      return a;
    },
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    isOnline: () => !(opts.offline?.(now) ?? false),
    waitOnline: async (maxMs) => {
      const until = Math.min(now + maxMs, opts.onlineAt ?? now);
      now = Math.max(now, until);
    },
    expiresAt: opts.expiresInMs ?? HOUR,
    onHardFailure: () => {
      cancels++;
    },
    onStatus: (s) => statuses.push(s),
  });
  return {
    run,
    get calls() {
      return calls;
    },
    get cancels() {
      return cancels;
    },
    get now() {
      return now;
    },
    statuses,
  };
}

describe("แยกผลการบันทึกหนึ่งครั้ง", () => {
  it("retry/busy ชั่วคราว, ok เสร็จ, ที่เหลือล้มถาวร", () => {
    assert.equal(classifyRegisterResult({ ok: true }), "done");
    assert.equal(classifyRegisterResult({ ok: false, error: "retry" }), "retry");
    assert.equal(classifyRegisterResult({ ok: false, error: "busy" }), "retry");
    for (const e of ["forbidden", "invalid", "invalid_state", "storage_quota_exceeded", "upload_failed"]) {
      assert.equal(classifyRegisterResult({ ok: false, error: e }), "hard", e);
    }
  });
});

describe("ระยะรอก่อนลองครั้งถัดไป", () => {
  it("backoff แล้วคงที่ 30 วินาที", () => {
    const d = [1, 2, 3, 4, 5, 6, 7].map((attempt) => nextRegisterDelay({ attempt, activeMs: 0, msUntilExpiry: HOUR }));
    assert.deepEqual(d, [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });

  it("หยุดเมื่อจะเกินหน้าต่างเวลา", () => {
    assert.equal(nextRegisterDelay({ attempt: 9, activeMs: REGISTER_RETRY_WINDOW_MS - 29_000, msUntilExpiry: HOUR }), null);
    assert.equal(nextRegisterDelay({ attempt: 9, activeMs: REGISTER_RETRY_WINDOW_MS - 30_000, msUntilExpiry: HOUR }), 30_000);
  });

  it("หยุดก่อนคำขอหมดอายุ โดยเหลือระยะเผื่อไว้", () => {
    assert.equal(nextRegisterDelay({ attempt: 1, activeMs: 0, msUntilExpiry: INTENT_SAFETY_MS + 999 }), null);
    assert.equal(nextRegisterDelay({ attempt: 1, activeMs: 0, msUntilExpiry: INTENT_SAFETY_MS + 1000 }), 1000);
  });

  it("หน้าต่างเป็นนาที ไม่ใช่วินาที", () => {
    assert.ok(REGISTER_RETRY_WINDOW_MS >= 5 * 60 * 1000);
  });

  it("หน้าต่างยาวพอให้คำขอที่ค้าง (claim แล้วคืนสิทธิ์ไม่ได้) ถูก claim ต่อได้ก่อนเลิกลอง", () => {
    // ช่วงรอยาวสุด 30 วินาที — ครั้งที่ลองหลังครบ STALE_CLAIM_MS ต้องยังอยู่ในหน้าต่าง
    assert.ok(REGISTER_RETRY_WINDOW_MS >= STALE_CLAIM_MS + 60_000);
    // และคำขอค้างต้องนานกว่า function ที่ยาวที่สุดของ Vercel (900 วินาที)
    assert.ok(STALE_CLAIM_MS > 900_000);
  });
});

describe("ลองบันทึกซ้ำ", () => {
  it("สำเร็จครั้งแรก — ไม่รอ ไม่ยกเลิก", async () => {
    const h = harness({ answers: () => ({ ok: true }) });
    assert.deepEqual(await h.run, { ok: true });
    assert.equal(h.calls, 1);
    assert.equal(h.cancels, 0);
    assert.deepEqual(h.statuses, ["saving"]);
  });

  it("Neon/R2 สะดุด 90 วินาที (เกิน 7 วินาทีของเดิมไปมาก) แล้วบันทึกผ่าน โดยไม่ต้องอัปใหม่", async () => {
    const h = harness({
      answers: (_n, now) => (now < 90_000 ? { ok: false, error: "retry" } : { ok: true }),
    });
    assert.deepEqual(await h.run, { ok: true });
    assert.equal(h.cancels, 0);
    assert.ok(h.now >= 90_000);
    assert.ok(h.statuses.includes("retrying"));
  });

  it("action โยน (เน็ตหลุด) ก็ลองต่อ", async () => {
    const h = harness({ answers: (n) => (n < 5 ? "throw" : { ok: true }) });
    assert.deepEqual(await h.run, { ok: true });
    assert.equal(h.calls, 5);
    assert.equal(h.cancels, 0);
  });

  it("หมดหน้าต่างแล้ว = unconfirmed และ **ไม่** ยกเลิกคำขอ", async () => {
    const h = harness({ answers: () => ({ ok: false, error: "retry" }) });
    assert.deepEqual(await h.run, { ok: false, error: "unconfirmed" });
    assert.equal(h.cancels, 0);
    assert.ok(h.now <= REGISTER_RETRY_WINDOW_MS, `stopped at ${h.now}`);
    assert.ok(h.now >= REGISTER_RETRY_WINDOW_MS - 30_000, `stopped too early at ${h.now}`);
  });

  it("ล้มถาวร — ยกเลิกคำขอหนึ่งครั้ง ไม่ลองซ้ำ", async () => {
    const h = harness({ answers: () => ({ ok: false, error: "invalid_state" }) });
    assert.deepEqual(await h.run, { ok: false, error: "invalid_state" });
    assert.equal(h.calls, 1);
    assert.equal(h.cancels, 1);
  });

  it("ครั้งแรกโยนแต่จริง ๆ ยังวิ่งอยู่ ครั้งถัดไปได้ busy แล้วได้ id เดิม — ไม่ยกเลิก", async () => {
    const h = harness({
      answers: (n) => (n === 1 ? "throw" : n < 4 ? { ok: false, error: "busy" } : { ok: true }),
    });
    assert.deepEqual(await h.run, { ok: true });
    assert.equal(h.cancels, 0);
  });

  it("Neon ล่มหลัง claim จนคืนสิทธิ์ไม่ได้: retry → โยน → busy จนครบ STALE_CLAIM_MS → claim ต่อแล้วบันทึกผ่าน", async () => {
    // จำลองเซิร์ฟเวอร์: claim ครั้งแรกที่ t=0 ค้างไว้ (คืนสิทธิ์ล้ม) DB ล่ม 10 วินาที
    // หลังจากนั้นทุกครั้งได้ busy จนคำขอค้างครบ STALE_CLAIM_MS แล้วครั้งถัดไป claim ต่อได้
    const h = harness({
      answers: (n, now) => {
        if (n === 1) return { ok: false, error: "retry" };
        if (now < 10_000) return "throw";
        return now < STALE_CLAIM_MS ? { ok: false, error: "busy" } : { ok: true };
      },
      expiresInMs: 6 * HOUR,
    });
    assert.deepEqual(await h.run, { ok: true });
    assert.equal(h.cancels, 0);
    assert.ok(h.now >= STALE_CLAIM_MS);
  });

  it("retry แล้วตามด้วย forbidden = คำขอใช้ไม่ได้แล้วจริง ล้มถาวรทันที ไม่หลอกว่าไฟล์ยังอยู่", async () => {
    const h = harness({ answers: (n) => (n === 1 ? { ok: false, error: "retry" } : { ok: false, error: "forbidden" }) });
    assert.deepEqual(await h.run, { ok: false, error: "forbidden" });
    assert.equal(h.calls, 2);
    assert.equal(h.cancels, 1);
  });

  it("โยนแล้วตามด้วย forbidden ก็ล้มถาวรทันที — ไม่ลองต่อสิบนาทีแล้วขึ้นว่าไม่หาย", async () => {
    const h = harness({ answers: (n) => (n === 1 ? "throw" : { ok: false, error: "forbidden" }) });
    assert.deepEqual(await h.run, { ok: false, error: "forbidden" });
    assert.equal(h.calls, 2);
    assert.equal(h.cancels, 1);
  });

  it("busy ค้างไปตลอด (ไม่ควรเกิด) = unconfirmed ไม่ใช่ยกเลิก", async () => {
    const h = harness({ answers: (n) => (n === 1 ? "throw" : { ok: false, error: "busy" }) });
    assert.deepEqual(await h.run, { ok: false, error: "unconfirmed" });
    assert.equal(h.cancels, 0);
  });

  it("ไม่ลองเลยวันหมดอายุของคำขอ", async () => {
    const expiresInMs = INTENT_SAFETY_MS + 60_000;
    const h = harness({ answers: () => ({ ok: false, error: "retry" }), expiresInMs });
    assert.deepEqual(await h.run, { ok: false, error: "unconfirmed" });
    assert.ok(h.now <= expiresInMs - INTENT_SAFETY_MS, `now ${h.now}`);
    assert.equal(h.cancels, 0);
  });

  it("ช่วงออฟไลน์ไม่กินหน้าต่างเวลา — ออฟไลน์ 20 นาทีแล้วกลับมาบันทึกผ่าน", async () => {
    const back = 20 * 60 * 1000 + 5_000;
    const h = harness({
      // ระหว่างออฟไลน์ action โยนทุกครั้ง
      answers: (_n, now) => (now < back ? "throw" : { ok: true }),
      offline: (now) => now < back,
      onlineAt: back,
    });
    assert.deepEqual(await h.run, { ok: true });
    assert.equal(h.cancels, 0);
    assert.ok(h.statuses.includes("offline"));
    assert.ok(h.now >= back);
  });

  it("ออฟไลน์นานจนคำขอใกล้หมดอายุ — รอไม่เกินเส้นเผื่อ แล้ว unconfirmed", async () => {
    const expiresInMs = HOUR;
    const h = harness({
      answers: () => "throw",
      offline: () => true,
      onlineAt: 10 * HOUR,
      expiresInMs,
    });
    assert.deepEqual(await h.run, { ok: false, error: "unconfirmed" });
    assert.ok(h.now <= expiresInMs, `now ${h.now}`);
    assert.equal(h.cancels, 0);
  });
});
