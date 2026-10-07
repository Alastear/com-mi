/** A deadline does not cancel a Server Action or imply its transaction failed. */
export async function settleWithin<T>(call: () => Promise<T>, ms: number): Promise<{ done: true; value: T } | { done: false }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(call).then(value => ({ done: true as const, value })),
      new Promise<{ done: false }>(resolve => { timer = setTimeout(() => resolve({ done: false }), ms); }),
    ]);
  } finally { clearTimeout(timer); }
}
