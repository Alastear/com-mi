"use client";
import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { useLocale } from "@/lib/i18n/client";

export function ConfirmButton({ title, description, onConfirm, children, ...props }: Omit<ComponentProps<typeof Button>, "onClick" | "title"> & { title: string; description: string; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  const { t, locale } = useLocale();
  return <><Button {...props} type="button" onClick={() => setOpen(true)}>{children}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription><DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>{t.common.cancel}</Button>
      <Button variant="destructive" disabled={props.disabled} onClick={() => { setOpen(false); onConfirm(); }}>{locale === "th" ? "ยืนยัน" : "Confirm"}</Button>
    </DialogFooter></DialogContent></Dialog>
  </>;
}
