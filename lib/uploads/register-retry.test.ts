import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyRegisterResult,
  INTENT_SAFETY_MS,
  nextRegisterDelay,
  REGISTER_RETRY_WINDOW_MS,
  registerWithRetry,
  type RegisterCallResult,
  type RegisterStatus,
} from "./register-retry";

const HOUR = 60 * 60 * 1000;

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
  it("retry ชั่วคราว, ok เสร็จ, ที่เหลือล้มถาวร", () => {
    assert.equal(classifyRegisterResult({ ok: true }, false), "done");
    assert.equal(classifyRegisterResult({ ok: false, error: "retry" }, false), "retry");
    for (const e of ["forbidden", "invalid", "invalid_state", "storage_quota_exceeded", "upload_failed"]) {
      assert.equal(classifyRegisterResult({ ok: false, error: e }, false), "hard", e);
    }
  });

  it("forbidden หลังครั้งที่โยน = ครั้งนั้นอาจยังถือคำขออยู่ ต้องลองต่อ ไม่ใช่ทิ้ง", () => {
    assert.equal(classifyRegisterResult({ ok: false, error: "forbidden" }, true), "retry");
    // เรื่องอื่นมาจากครั้งที่ claim ได้จริง — ผลแน่นอนแล้ว
    assert.equal(classifyRegisterResult({ ok: false, error: "invalid_state" }, true), "hard");
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

  it("ครั้งแรกโยนแต่จริง ๆ ยังวิ่งอยู่ ครั้งถัดไปได้ forbidden แล้วได้ id เดิม — ไม่ยกเลิก", async () => {
    const h = harness({
      answers: (n) => (n === 1 ? "throw" : n < 4 ? { ok: false, error: "forbidden" } : { ok: true }),
    });
    assert.deepEqual(await h.run, { ok: true });
    assert.equal(h.cancels, 0);
  });

  it("forbidden ค้างไปตลอดหลังครั้งที่โยน = unconfirmed ไม่ใช่ยกเลิก", async () => {
    const h = harness({ answers: (n) => (n === 1 ? "throw" : { ok: false, error: "forbidden" }) });
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
