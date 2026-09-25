"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "./config";
import { getDictionary, type Dictionary } from "./dictionaries";
import { saveLocale } from "./actions";

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
    /**
     * จำไว้ที่บัญชีด้วย อีเมลที่ส่งตอนเราไม่ได้เปิดเว็บจะได้เป็นภาษาเดียวกัน
     *
     * ⚠️ ต้องรอให้คำขอออกไปก่อน reload — reload ตัดคำขอที่ค้างอยู่ทิ้ง
     * แต่ห้ามรอนานเกินไป: ปุ่มเปลี่ยนภาษาต้องทำงานแม้ server ตอบช้าหรือพัง
     * cookie เขียนไปแล้วข้างบน หน้าเว็บจึงเปลี่ยนภาษาได้เสมอ
     */
    const saved = saveLocale(next).catch(() => {});
    const giveUp = new Promise<void>((resolve) => setTimeout(resolve, 2500));
    void Promise.race([saved, giveUp]).then(() => window.location.reload());
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
