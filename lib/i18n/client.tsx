"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "./config";
import { getDictionary, type Dictionary } from "./dictionaries";

type LocaleContextValue = {
  locale: Locale;
  t: Dictionary;
  setLocale: (next: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const setLocale = useCallback((next: Locale) => {
    // คุกกี้อายุ 1 ปี — reload เพื่อให้ฝั่ง server เรนเดอร์ด้วยภาษาใหม่
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, t: getDictionary(locale), setLocale }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // ป้องกันไม่ให้ทั้งหน้าพังถ้าลืมครอบ provider
    return { locale: DEFAULT_LOCALE, t: getDictionary(DEFAULT_LOCALE), setLocale: () => {} };
  }
  return ctx;
}

/** ทางลัดที่ใช้บ่อยที่สุดในคอมโพเนนต์ฝั่ง client */
export function useDict(): Dictionary {
  return useLocale().t;
}
