import Link from "next/link";
import { Button } from "@/components/ui/button";
import { dynamicHref } from "@/lib/routes";

export function ClientPagination({ page, hasNext, base, q = "", th }: { page: number; hasNext: boolean; base: string; q?: string; th: boolean }) {
  const href = (next: number) => dynamicHref(`${base}?${new URLSearchParams({ q, page: String(next) })}`);
  return <nav aria-label={th ? "แบ่งหน้ารายการ" : "Pagination"} className="flex items-center justify-between gap-2">
    {page > 1 ? <Button asChild variant="outline"><Link href={href(page - 1)}>{th ? "ก่อนหน้า" : "Previous"}</Link></Button> : <Button disabled variant="outline">{th ? "ก่อนหน้า" : "Previous"}</Button>}
    <span className="text-sm">{th ? "หน้า" : "Page"} {page}</span>
    {hasNext && page < 10000 ? <Button asChild variant="outline"><Link href={href(page + 1)}>{th ? "ถัดไป" : "Next"}</Link></Button> : <Button disabled variant="outline">{th ? "ถัดไป" : "Next"}</Button>}
  </nav>;
}
