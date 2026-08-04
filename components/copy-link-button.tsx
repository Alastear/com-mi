"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDict } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export function CopyLinkButton({
  value,
  label,
  className,
  variant = "outline",
  size = "default",
}: {
  value: string;
  label?: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const t = useDict();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(t.common.copied);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t.common.copy);
    }
  }

  return (
    <Button variant={variant} size={size} onClick={copy} className={cn(className)}>
      {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
      {label ?? (copied ? t.common.copied : t.common.copy)}
    </Button>
  );
}
