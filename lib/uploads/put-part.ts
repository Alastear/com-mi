import { isRetryableStatus, MAX_PART_ATTEMPTS } from "./errors";

// Limit each 8 MiB PUT independently. Retrying the same multipart part replaces it.
export const PART_TIMEOUT_MS = 180_000;

export async function putPart(url: string, chunk: Blob, deps: {
  signal: AbortSignal;
  waitToRetry: (attempt: number, signal: AbortSignal) => Promise<void>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  onRetry?: () => void;
}): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    deps.signal.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort(deps.signal.reason);
    deps.signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException("Upload part timed out", "TimeoutError")), deps.timeoutMs ?? PART_TIMEOUT_MS);
    let res: Response | null = null;
    try {
      res = await (deps.fetch ?? fetch)(url, { method: "PUT", body: chunk, signal: controller.signal });
    } catch (error) {
      if (deps.signal.aborted || attempt >= MAX_PART_ATTEMPTS) throw error;
    } finally {
      clearTimeout(timer);
      deps.signal.removeEventListener("abort", abort);
    }
    if (res?.ok) {
      const etag = res.headers.get("etag");
      if (!etag) throw new Error("upload_failed");
      return etag;
    }
    if (res && (!isRetryableStatus(res.status) || attempt >= MAX_PART_ATTEMPTS)) throw new Error(`put_${res.status}`);
    deps.onRetry?.();
    await deps.waitToRetry(attempt, deps.signal);
  }
}
