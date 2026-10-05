export const CLIENT_PAGE_SIZE = 20;
export function clientFilters(input: { q?: string; page?: string }) {
  const q = (typeof input.q === "string" ? input.q : "").trim().slice(0, 100);
  const raw = typeof input.page === "string" ? input.page : "1";
  const page = /^\d{1,5}$/.test(raw) ? Math.max(1, Math.min(10000, Number(raw))) : 1;
  return { q, page, offset: (page - 1) * CLIENT_PAGE_SIZE,
    pattern: `%${q.replace(/[\\%_]/g, char => `\\${char}`)}%` };
}
