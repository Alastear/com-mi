import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EMAIL_GAP_MS, RATE_LIMIT_RETRIES, createPacer, rateLimitDelayMs } from "./pace";

/** นาฬิกาปลอม — `sleep` เดินเวลาไปจริงในโลกของเทสต์ และจดไว้ว่าแต่ละคนได้ยิงตอนไหน */
function fakeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t = Math.max(t, t + ms);
    },
    set: (v: number) => {
      t = v;
    },
  };
}

describe("createPacer", () => {
  it("คนแรกยิงได้ทันที ไม่ต้องรอ", async () => {
    const clock = fakeClock();
    const slept: number[] = [];
    const pacer = createPacer({
      gapMs: 600,
      now: clock.now,
      sleep: async (ms) => {
        slept.push(ms);
      },
    });
    await pacer.wait();
    assert.deepEqual(slept, []);
  });

  it("เรียกพร้อมกันห้าคน = ห้าช่องเวลาเรียงกัน ห่างกันอย่างน้อย gap (after() ของ cron ยิงพร้อมกันหมด)", async () => {
    // ทุกคนเรียกตอนเวลาเดียวกัน — sleep ไม่เดินนาฬิกา ดูแค่ว่าแต่ละคนถูกสั่งให้รอนานเท่าไร
    const t0 = 5_000;
    const waits: number[] = [];
    const pacer = createPacer({
      gapMs: 600,
      now: () => t0,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    await Promise.all([pacer.wait(), pacer.wait(), pacer.wait(), pacer.wait(), pacer.wait()]);
    assert.deepEqual(waits, [600, 1200, 1800, 2400]);
  });

  it("ห่างกันเกิน gap อยู่แล้ว = ไม่ต้องรอ", async () => {
    const clock = fakeClock();
    const waits: number[] = [];
    const pacer = createPacer({
      gapMs: 600,
      now: clock.now,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    await pacer.wait();
    clock.set(clock.now() + 601);
    await pacer.wait();
    assert.deepEqual(waits, []);
  });

  it("มาห่างกันไม่ถึง gap = รอเฉพาะส่วนที่ขาด", async () => {
    const clock = fakeClock();
    const waits: number[] = [];
    const pacer = createPacer({
      gapMs: 600,
      now: clock.now,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    await pacer.wait();
    clock.set(clock.now() + 250);
    await pacer.wait();
    assert.deepEqual(waits, [350]);
  });

  it("ค่าจริงต่ำกว่าเพดาน 2 ครั้ง/วินาทีของ Resend", () => {
    assert.ok(EMAIL_GAP_MS >= 500);
  });
});

describe("rateLimitDelayMs", () => {
  it("เชื่อ retry-after ของ Resend (วินาที)", () => {
    assert.equal(rateLimitDelayMs(1, "1"), 1000);
    assert.equal(rateLimitDelayMs(1, " 2 "), 2000);
  });

  it("ไม่มี retry-after = ถอยทวีคูณจาก 1 วินาที", () => {
    assert.equal(rateLimitDelayMs(1, null), 1000);
    assert.equal(rateLimitDelayMs(2, undefined), 2000);
    assert.equal(rateLimitDelayMs(1, "abc"), 1000);
  });

  it("ไม่รอน้อยกว่า gap และไม่เกิน 5 วินาที (after() ใช้เวลาของ function เดียวกับ cron)", () => {
    assert.equal(rateLimitDelayMs(1, "0"), EMAIL_GAP_MS);
    assert.equal(rateLimitDelayMs(1, "3600"), 5000);
  });

  it("ลองซ้ำได้จำกัดครั้ง แล้วเลิก", () => {
    assert.notEqual(rateLimitDelayMs(RATE_LIMIT_RETRIES, null), null);
    assert.equal(rateLimitDelayMs(RATE_LIMIT_RETRIES + 1, "1"), null);
  });
});
