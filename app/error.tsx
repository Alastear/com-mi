"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDict } from "@/lib/i18n/client";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useDict();

  useEffect(() => {
    // ของจริงส่งเข้า Sentry/observability ที่นี่ พร้อม digest เพื่อจับคู่กับ server log
    console.error(error);
  }, [error]);

  return (
    <div className="grid flex-1 place-items-center px-4 py-24 text-center">
      <div className="max-w-sm">
        <p className="text-lg font-semibold">
          {t.error.title}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {t.error.body}
        </p>
        {error.digest ? (
          <p className="tabular mt-3 font-mono text-xs text-muted-foreground">{error.digest}</p>
        ) : null}
        <Button onClick={reset} className="mt-6">
          <RotateCw className="size-4" />
          {t.error.retry}
        </Button>
      </div>
    </div>
  );
}
