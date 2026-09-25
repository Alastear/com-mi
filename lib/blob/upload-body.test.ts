import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isClientTokenRequest, parseClientPayload } from "./upload-body";

/**
 * ด่านหน้า route ออก token อัปโหลด
 *
 * เดิม body ว่าง / ไม่ใช่ JSON / `{}` ตกไปถึง SDK แล้วกลายเป็น 500 "upload_failed"
 * ซึ่งแยกไม่ออกจาก Blob ล่มจริง ตอนนี้ต้องถูกคัดออกตรงนี้เพื่อตอบ 400
 */
describe("isClientTokenRequest", () => {
  // รูปร่างที่ upload() ของ SDK ส่งจริง (ดู components/app/delivery-panel.tsx)
  const real = {
    type: "blob.generate-client-token",
    payload: {
      pathname: "deliveries/ABCD2345/3f6c2d1e-8a4b-4c7e-9f10-2b5d6e7a8c90",
      clientPayload: JSON.stringify({ code: "ABCD2345" }),
      multipart: true,
    },
  };

  it("ยอมรูปร่างที่ SDK ส่งมาจริง", () => {
    assert.equal(isClientTokenRequest(real), true);
  });

  it("ยอมเมื่อ clientPayload / multipart หายไปทั้งคีย์ — JSON.stringify ทิ้ง undefined", () => {
    assert.equal(
      isClientTokenRequest({ type: "blob.generate-client-token", payload: { pathname: "a/b" } }),
      true,
    );
    assert.equal(
      isClientTokenRequest({
        type: "blob.generate-client-token",
        payload: { pathname: "a/b", clientPayload: null },
      }),
      true,
    );
  });

  it("ปฏิเสธ body ที่ไม่ใช่ object", () => {
    for (const body of [undefined, null, "", "x", 1, true, []]) {
      assert.equal(isClientTokenRequest(body), false, JSON.stringify(body));
    }
  });

  it("ปฏิเสธ {} — เคสที่เคยได้ 500", () => {
    assert.equal(isClientTokenRequest({}), false);
  });

  it("ปฏิเสธเหตุการณ์อื่น รวมถึง upload-completed ที่ route นี้ไม่เคยลงทะเบียน callback", () => {
    assert.equal(isClientTokenRequest({ ...real, type: "blob.upload-completed" }), false);
    assert.equal(isClientTokenRequest({ ...real, type: "blob.generate-presigned-url" }), false);
    assert.equal(isClientTokenRequest({ ...real, type: undefined }), false);
  });

  it("ปฏิเสธ payload ที่หายหรือผิดชนิด", () => {
    const t = "blob.generate-client-token";
    assert.equal(isClientTokenRequest({ type: t }), false);
    assert.equal(isClientTokenRequest({ type: t, payload: null }), false);
    assert.equal(isClientTokenRequest({ type: t, payload: "x" }), false);
    assert.equal(isClientTokenRequest({ type: t, payload: {} }), false);
    assert.equal(isClientTokenRequest({ type: t, payload: { pathname: "" } }), false);
    assert.equal(isClientTokenRequest({ type: t, payload: { pathname: 42 } }), false);
    assert.equal(
      isClientTokenRequest({ type: t, payload: { pathname: "a", clientPayload: { code: "X" } } }),
      false,
    );
    assert.equal(isClientTokenRequest({ type: t, payload: { pathname: "a", multipart: "yes" } }), false);
  });
});

describe("parseClientPayload", () => {
  it("ไม่ได้ส่งมา → {} เหมือนพฤติกรรมเดิม", () => {
    assert.deepEqual(parseClientPayload(null), {});
    assert.deepEqual(parseClientPayload(undefined), {});
  });

  it("แกะ object ได้ตามปกติ", () => {
    assert.deepEqual(parseClientPayload('{"code":"ABCD2345"}'), { code: "ABCD2345" });
  });

  it("parse ไม่ได้ → null", () => {
    assert.equal(parseClientPayload(""), null);
    assert.equal(parseClientPayload("{"), null);
    assert.equal(parseClientPayload("code=ABCD2345"), null);
  });

  it("JSON ที่ไม่ใช่ object → null — เดิม JSON.parse('null').code โยน TypeError เป็น 500", () => {
    assert.equal(parseClientPayload("null"), null);
    assert.equal(parseClientPayload("42"), null);
    assert.equal(parseClientPayload('"ABCD2345"'), null);
    assert.equal(parseClientPayload("[]"), null);
  });
});
