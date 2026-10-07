import { test } from "node:test";
import assert from "node:assert/strict";
import { putPart } from "./put-part";

test("hung PUT is aborted and the same part succeeds on retry", async () => {
  let calls = 0; let aborted = false;
  const result = await putPart("https://example.invalid/part", new Blob(["test"]), {
    signal: new AbortController().signal, timeoutMs: 5, waitToRetry: async () => {},
    fetch: async (_url, init) => {
      calls++;
      if (calls===1) return new Promise<Response>((_resolve,reject) => init?.signal?.addEventListener("abort", () => { aborted=true; reject(init.signal?.reason); }));
      return new Response("",{headers:{etag:"same-part-etag"}});
    },
  });
  assert.equal(result,"same-part-etag"); assert.equal(calls,2); assert.equal(aborted,true);
});

test("403 and missing ETag are hard failures, never retried", async () => {
  for (const response of [new Response("",{status:403}), new Response("")]) {
    let calls=0;
    await assert.rejects(putPart("https://example.invalid/part",new Blob(["x"]),{
      signal:new AbortController().signal, waitToRetry:async()=>{throw new Error("must not retry");},
      fetch:async()=>{calls++;return response;},
    })); assert.equal(calls,1);
  }
});

test("sibling failure aborts the active PUT and does not start another attempt", async () => {
  const abort=new AbortController(); let calls=0;
  await assert.rejects(putPart("https://example.invalid/part",new Blob(["x"]),{
    signal:abort.signal,waitToRetry:async()=>{throw new Error("must not retry");},
    fetch:async(_url,init)=>{calls++; abort.abort(); throw init?.signal?.reason;},
  })); assert.equal(calls,1);
});
