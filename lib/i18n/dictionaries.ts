import type { Locale } from "./config";

/**
 * พจนานุกรมข้อความทั้งระบบ
 *
 * กฎ: ห้ามฮาร์ดโค้ดข้อความที่ผู้ใช้เห็นในคอมโพเนนต์ — ต้องผ่านที่นี่เสมอ
 * รวมถึงห้ามเขียน `locale === "th" ? "…" : "…"` ในหน้าเพจด้วย
 * (ตัดสินใจไว้ใน docs/05-roadmap.md — ทำสองภาษาตั้งแต่ Phase 0)
 *
 * ยกเว้น 3 กรณี:
 *   1. เนื้อหาที่ครีเอเตอร์เขียนเอง (bio / TOS / ชื่อ service) — เป็นภาษาที่เจ้าตัวเขียน ไม่แปล
 *   2. `lib/format.ts` — ที่นั่นแมป locale เป็น BCP-47 tag ให้ Intl ไม่ใช่ข้อความ
 *   3. `app/global-error.tsx` — รันตอน root layout พัง จึงไม่มี provider ให้อ่าน locale
 *      เลยต้องพิมพ์สองภาษาพร้อมกัน
 */
const th = {
  brand: {
    name: "com-mi",
    tagline: "ระบบรับงาน commission ที่ครีเอเตอร์คุมเองได้ทั้งหมด",
  },

  common: {
    save: "บันทึก",
    cancel: "ยกเลิก",
    edit: "แก้ไข",
    delete: "ลบ",
    back: "ย้อนกลับ",
    next: "ถัดไป",
    close: "ปิด",
    confirm: "ยืนยัน",
    search: "ค้นหา",
    filter: "ตัวกรอง",
    all: "ทั้งหมด",
    loading: "กำลังโหลด…",
    copy: "คัดลอก",
    copied: "คัดลอกแล้ว",
    share: "แชร์",
    viewAll: "ดูทั้งหมด",
    days: "วัน",
    day: "วัน",
    from: "เริ่มต้น",
    perPiece: "ต่อชิ้น",
    optional: "ไม่บังคับ",
    required: "จำเป็น",
    upgrade: "อัปเกรดเป็น Pro",
    proOnly: "ฟีเจอร์ Pro",
    signIn: "เข้าสู่ระบบ",
    signInWithGoogle: "เข้าสู่ระบบด้วย Google",
    signOut: "ออกจากระบบ",
    language: "ภาษา",
    theme: "ธีม",
    themeDark: "มืด",
    themeLight: "สว่าง",
    themeSystem: "ตามระบบ",
    on: "เปิดอยู่",
    yes: "มี",
    no: "ไม่มี",
  },

  nav: {
    explore: "ค้นหาครีเอเตอร์",
    pricing: "ราคา",
    dashboard: "ภาพรวม",
    orders: "งานของฉัน",
    services: "เมนูรับงาน",
    listings: "Adopts / YCH",
    portfolio: "ผลงาน",
    shop: "หน้าร้าน",
    clients: "ลูกค้า",
    calendar: "ปฏิทิน",
    analytics: "สถิติ",
    inbox: "การแจ้งเตือน",
    settings: "ตั้งค่า",
    myRequests: "คำขอของฉัน",
    menu: "เมนู",
  },

  /** ข้อความที่บอกผู้ใช้ว่าเป็น prototype — ลบทั้งกลุ่มนี้ตอนต่อระบบจริง */
  prototype: {
    requestSent: "ส่งคำขอเรียบร้อย — นี่คือ prototype จึงยังไม่บันทึกจริง",
    messageSent: "ส่งข้อความแล้ว (prototype)",
    paymentRecorded: "บันทึกการรับเงินแล้ว (prototype)",
    actionDone: "ดำเนินการแล้ว (prototype)",
    notSavedNote: "prototype เท่านั้น — ยังไม่บันทึกลงฐานข้อมูล",
  },

  error: {
    title: "เกิดข้อผิดพลาดบางอย่าง",
    body: "ลองโหลดใหม่อีกครั้ง ถ้ายังไม่หายรบกวนแจ้งเราพร้อมรหัสด้านล่าง",
    retry: "ลองใหม่",
    notFoundBody: "ไม่พบหน้าที่คุณกำลังหา — อาจถูกย้ายหรือลิงก์พิมพ์ผิด",
  },

  auth: {
    tosNotice: "การเข้าสู่ระบบถือว่าคุณยอมรับ",
    and: "และ",
    signedInAs: "เข้าสู่ระบบในชื่อ",
    finishSetup: "ตั้งค่าหน้าร้านให้เสร็จ →",
  },

  onboarding: {
    title: "ตั้งชื่อลิงก์หน้าร้านของคุณ",
    subtitle: "นี่คือลิงก์ที่คุณจะเอาไปแปะใน bio — เปลี่ยนทีหลังได้",
    hint: "ใช้ a–z, 0–9 และ _ ความยาว 3–30 ตัวอักษร",
    available: "ใช้ชื่อนี้ได้",
    format: "ใช้ได้เฉพาะ a–z, 0–9 และ _ ความยาว 3–30 ตัวอักษร",
    reserved: "ชื่อนี้ระบบสงวนไว้ ลองชื่ออื่นนะครับ",
    taken: "มีคนใช้ชื่อนี้แล้ว ลองชื่ออื่น",
    submit: "ใช้ชื่อนี้",
    canChange: "เปลี่ยนได้ทีหลังในหน้าตั้งค่า แต่ลิงก์เดิมจะใช้ไม่ได้ทันที",
  },

  legal: {
    terms: "ข้อกำหนดการใช้งาน",
    privacy: "นโยบายความเป็นส่วนตัว",
    placeholder: "เอกสารฉบับจริงจะเขียนก่อนเปิดใช้งานจริง",
  },

  landing: {
    heroTitle: "รับงาน commission ให้เป็นระบบ",
    heroTitleAccent: "ในลิงก์เดียว",
    heroSubtitle:
      "หน้าร้านที่แปะใน bio ได้เลย พร้อมระบบจัดการคิว ส่งงาน และเก็บเงิน — เลิกตามงานใน DM สักที",
    heroCta: "สร้างหน้าร้านฟรี",
    heroCtaSecondary: "ดูตัวอย่างหน้าร้าน",
    heroNote: "ใช้ฟรีได้จริง ไม่ต้องใส่บัตร",
    featuresTitle: "ทุกอย่างที่ต้องใช้ อยู่ในที่เดียว",
    features: {
      shopTitle: "หน้าร้านที่ดูเป็นมืออาชีพ",
      shopBody:
        "เมนูรับงาน ราคา คิวปัจจุบัน และผลงาน รวมอยู่ในลิงก์เดียวที่แชร์ลง X หรือ Discord แล้วสวย",
      queueTitle: "บอร์ดจัดการคิวงาน",
      queueBody:
        "ลากการ์ดข้ามคอลัมน์เพื่อเปลี่ยนสถานะ เห็นทันทีว่างานไหนใกล้ครบกำหนด งานไหนรอลูกค้าตอบ",
      briefTitle: "ฟอร์มบรีฟที่คุณออกแบบเอง",
      briefBody:
        "กำหนดเองว่าลูกค้าต้องกรอกอะไรบ้าง ไม่ต้องถามซ้ำใน DM อีกต่อไป พร้อมแนบ reference ได้เลย",
      payTitle: "PromptPay QR ในตัว",
      payBody:
        "สร้าง QR จากพร้อมเพย์ของคุณเอง เงินเข้าบัญชีคุณโดยตรง เราไม่แตะเงินของคุณแม้แต่บาทเดียว",
      notifyTitle: "แจ้งเตือนทันทีที่มีงานเข้า",
      notifyBody:
        "Push บนเบราว์เซอร์ อีเมล หรือเด้งเข้า Discord เซิร์ฟเวอร์ของคุณ ไม่พลาดงานอีกต่อไป",
      adoptTitle: "ระบบประมูล Adopts / YCH",
      adoptBody:
        "เปิดประมูลพร้อมระบบต่อเวลาอัตโนมัติเมื่อมีคนบิดช่วงท้าย ปิดประมูลแล้วกลายเป็นออเดอร์ทันที",
    },
    howTitle: "เริ่มใช้ได้ใน 10 นาที",
    how: {
      s1Title: "เข้าสู่ระบบด้วย Google",
      s1Body: "ไม่ต้องจำรหัสผ่านเพิ่มอีกอัน",
      s2Title: "ตั้งเมนูรับงาน",
      s2Body: "เลือกจากเทมเพลตแล้วปรับราคาตามที่คุณต้องการ",
      s3Title: "แชร์ลิงก์หน้าร้าน",
      s3Body: "แปะใน bio แล้วรอรับงานได้เลย",
    },
    ctaTitle: "พร้อมเปิดร้านหรือยัง",
    ctaBody: "ใช้ฟรีได้ครบทุกขั้นตอน ตั้งแต่รับคำขอจนส่งงานเสร็จ",
  },

  pricing: {
    title: "ราคา",
    subtitle: "ลูกค้าที่มาสั่งงานคุณใช้ฟรีเสมอ เราเก็บค่าบริการจากครีเอเตอร์เท่านั้น",
    monthly: "รายเดือน",
    yearly: "รายปี",
    yearlyBadge: "ประหยัด 2 เดือน",
    perMonth: "/เดือน",
    perYear: "/ปี",
    currentPlan: "แพ็กเกจปัจจุบัน",
    choosePlan: "เลือกแพ็กเกจนี้",
    startFree: "เริ่มใช้ฟรี",
    popular: "แนะนำ",
    faqTitle: "คำถามที่พบบ่อย",
    noEscrowQ: "แพลตฟอร์มถือเงินของฉันไหม",
    noEscrowA:
      "ไม่ครับ เงินโอนจากลูกค้าเข้าบัญชีคุณโดยตรงผ่าน PromptPay หรือช่องทางที่คุณตั้งไว้ ระบบทำหน้าที่บันทึกและล็อกไฟล์ส่งมอบจนกว่าจะได้รับเงินครบเท่านั้น",
    freeLimitQ: "ใช้ฟรีแล้วเจอกำแพงตอนไหน",
    freeLimitA:
      "แพ็กเกจฟรีรับงานพร้อมกันได้ 5 งาน มีเมนูได้ 5 รายการ และผลงาน 12 ชิ้น ซึ่งครอบคลุมการรับงานทั่วไปได้สบาย ส่วน Pro เหมาะกับคนที่รับงานต่อเนื่องและอยากได้แจ้งเตือนทันที",
    downgradeQ: "ถ้ายกเลิก Pro ข้อมูลหายไหม",
    downgradeA:
      "ไม่หายครับ งานที่รับอยู่ทำต่อจนจบได้ตามปกติ ส่วนเมนูและผลงานที่เกินโควตาจะถูกซ่อนไว้เฉย ๆ กลับมาสมัคร Pro เมื่อไหร่ก็แสดงกลับทันที",
    freeBullets: {
      orders: "รับงานพร้อมกัน 5 งาน",
      services: "เมนูรับงาน 5 รายการ",
      portfolio: "ผลงาน 12 ชิ้น",
      storage: "พื้นที่เก็บไฟล์ 300 MB",
      noEscrow: "เงินเข้าบัญชีคุณโดยตรง ไม่หัก % จากออเดอร์",
    },
    proBullets: {
      orders: "รับงานไม่จำกัด",
      notify: "Web Push + Discord แจ้งเตือนทันที",
      auctions: "ระบบประมูล Adopts / YCH",
      theme: "ธีมหน้าร้านของตัวเอง",
      analytics: "สถิติ + CRM ลูกค้า",
    },
  },

  /** ตารางเปรียบเทียบในหน้า /pricing — โครงสร้างอยู่ใน lib/billing/plans.ts */
  compare: {
    groups: {
      shop: "หน้าร้าน",
      menu: "เมนูและการรับงาน",
      notify: "การแจ้งเตือน",
      adopts: "Adopts / YCH และลูกค้า",
      other: "อื่น ๆ",
    },
    rows: {
      shop: "หน้าร้านสาธารณะ + ลิงก์ของตัวเอง",
      portfolio: "ผลงานใน portfolio",
      theme: "ปรับธีมและสีเอง",
      badge: "ซ่อนแบดจ์แพลตฟอร์ม",
      services: "จำนวนเมนูรับงาน",
      active: "งานที่รับพร้อมกัน",
      form: "ฟอร์มบรีฟ",
      milestone: "งวดงาน / มัดจำแบ่งจ่าย",
      inapp: "แจ้งเตือนในเว็บ",
      email: "อีเมล",
      push: "Web Push บนเบราว์เซอร์",
      discord: "เด้งเข้า Discord ของคุณ",
      listing: "Listing ราคาตายตัว",
      auction: "ระบบประมูล + ต่อเวลาอัตโนมัติ",
      waitlist: "ยิงแจ้งเตือนรายชื่อรอทั้งหมด",
      crm: "CRM ลูกค้า (แท็ก โน้ต blacklist)",
      storage: "พื้นที่เก็บไฟล์",
      filesize: "ขนาดไฟล์ต่อชิ้น",
      retention: "เก็บไฟล์ส่งมอบ",
      analytics: "สถิติและ export ข้อมูล",
    },
    values: {
      unlimited: "ไม่จำกัด",
      presets3: "3 ชุดสำเร็จรูป",
      fullyCustom: "สร้างเอง",
      dailyDigest: "สรุปวันละครั้ง",
      instant: "ทันที",
      days90: "90 วัน",
      forever: "ถาวร",
    },
  },

  plan: {
    free: "Free",
    pro: "Pro",
    studio: "Studio",
    freeDesc: "สำหรับคนที่รับงานเป็นครั้งคราว",
    proDesc: "สำหรับคนที่รับงานต่อเนื่อง",
    studioDesc: "สำหรับทีมและสตูดิโอ",
  },

  shopStatus: {
    open: "เปิดรับงาน",
    closed: "ปิดรับงาน",
    waitlist: "เปิดรายชื่อรอ",
    vacation: "พักงานชั่วคราว",
  },

  creator: {
    queueCount: "คิวปัจจุบัน",
    avgDelivery: "ส่งงานเฉลี่ย",
    completed: "งานที่ส่งแล้ว",
    rating: "คะแนน",
    menuTitle: "เมนูรับงาน",
    portfolioTitle: "ผลงาน",
    reviewsTitle: "รีวิวจากลูกค้า",
    tosTitle: "ข้อตกลงรับงาน",
    orderNow: "สั่งงาน",
    viewMenu: "ดูเมนูรับงาน",
    notifyMe: "แจ้งเตือนเมื่อเปิดรับ",
    notifyMeDone: "จะแจ้งเตือนคุณเมื่อเปิดรับ",
    joinWaitlist: "เข้าคิวรายชื่อรอ",
    noReviews: "ยังไม่มีรีวิว",
    reviewCount: "รีวิว",
    slotsLeft: "เหลืออีก {n} คิว",
    fullyBooked: "คิวเต็มแล้ว",
    poweredBy: "สร้างด้วย",
  },

  service: {
    startingAt: "เริ่มต้น",
    deliveryIn: "ส่งงานใน",
    revisions: "แก้ไขได้",
    times: "ครั้ง",
    whatYouGet: "สิ่งที่คุณจะได้รับ",
    addons: "ตัวเลือกเพิ่มเติม",
    tier: "ระดับความละเอียด",
    total: "ราคารวม",
    orderThis: "ส่งคำขอ",
    instantOrder: "สั่งได้ทันที",
    customProposal: "ต้องเสนอราคาก่อน",
    instantOrderHint: "ราคาตายตัว จ่ายแล้วเข้าคิวได้เลย",
    customProposalHint: "ครีเอเตอร์จะดูรายละเอียดแล้วเสนอราคาให้",
    stepPackage: "เลือกแพ็กเกจ",
    stepBrief: "กรอกรายละเอียด",
    stepConfirm: "ยืนยันคำขอ",
    acceptTos: "ฉันได้อ่านและยอมรับข้อตกลงรับงาน",
    submitRequest: "ส่งคำขอ",
    draftSaved: "บันทึกร่างอัตโนมัติแล้ว",
    tiersLabel: "ระดับ",
    addonsLabel: "ตัวเลือกเสริม",
    addService: "เพิ่มเมนู",
    limitReached: "ใช้เมนูครบ {n} รายการแล้ว — อัปเกรดเป็น Pro เพื่อเพิ่มได้ไม่จำกัด",
  },

  /** ฟอร์มบรีฟชุด preset — ของจริงมาจาก service.formSchema ใน DB */
  brief: {
    character: "ชื่อตัวละคร / OC",
    mood: "อารมณ์หรือบรรยากาศที่ต้องการ",
    detail: "รายละเอียดเพิ่มเติม",
    avoid: "มีอะไรที่ต้องเลี่ยงไหม",
    referenceFiles: "ไฟล์อ้างอิง",
    dropzone: "ลากไฟล์มาวาง หรือคลิกเพื่อเลือก",
    dropzoneHint: "ย่อและแปลงเป็น WebP ในเบราว์เซอร์ก่อนอัปโหลด",
    signInNote: "ต้องเข้าสู่ระบบด้วย Google ก่อนส่งคำขอ — ข้อมูลที่กรอกไว้จะไม่หาย",
  },

  order: {
    title: "งานของฉัน",
    code: "รหัสงาน",
    client: "ลูกค้า",
    creator: "ครีเอเตอร์",
    service: "งานที่สั่ง",
    total: "ยอดรวม",
    paid: "ชำระแล้ว",
    remaining: "คงเหลือ",
    dueIn: "ครบกำหนดอีก",
    overdue: "เลยกำหนด",
    dueToday: "ครบกำหนดวันนี้",
    revisionsUsed: "ใช้สิทธิ์แก้ไขแล้ว",
    boardView: "บอร์ด",
    listView: "รายการ",
    empty: "ยังไม่มีงานในคอลัมน์นี้",
    emptyAll: "ยังไม่มีงานเข้ามา",
    emptyAllHint: "แชร์ลิงก์หน้าร้านของคุณเพื่อเริ่มรับงาน",
    timeline: "ความเคลื่อนไหว",
    files: "ไฟล์",
    references: "ไฟล์อ้างอิงจากลูกค้า",
    wip: "งานระหว่างทำ",
    finalFiles: "ไฟล์ส่งมอบ",
    lockedUntilPaid: "ปลดล็อกเมื่อชำระเงินครบ",
    brief: "รายละเอียดที่ลูกค้ากรอก",
    privateNote: "โน้ตส่วนตัว",
    privateNoteHint: "ลูกค้าไม่เห็นข้อความนี้",
    payment: "การชำระเงิน",
    showQr: "แสดง PromptPay QR",
    markPaid: "บันทึกว่าได้รับเงินแล้ว",
    writeMessage: "พิมพ์ข้อความ…",
    send: "ส่ง",
    milestones: "งวดงาน",
    milestonesDesc: "แบ่งงานเป็นงวด กำหนดยอดมัดจำและวันครบกำหนดของแต่ละงวด",
    systemEvent: "ระบบ",
    noQuoteYet: "ยังไม่ได้เสนอราคา",
    needsQuote: "รอเสนอราคา",
    fullyPaid: "ชำระครบแล้ว",
    moveTo: "ย้ายไป…",
    daysLate: "เลย {n} วัน",
    daysLeft: "อีก {n} วัน",
  },

  orderStatus: {
    requested: "คำขอใหม่",
    reviewing: "กำลังพิจารณา",
    quoted: "เสนอราคาแล้ว",
    accepted: "รับงานแล้ว",
    in_progress: "กำลังทำ",
    in_review: "รอลูกค้าตรวจ",
    revision_requested: "ขอแก้ไข",
    delivered: "ส่งงานแล้ว",
    completed: "เสร็จสมบูรณ์",
    declined: "ปฏิเสธ",
    cancelled: "ยกเลิก",
    expired: "หมดอายุ",
  },

  orderAction: {
    sendQuote: "ส่งใบเสนอราคา",
    decline: "ปฏิเสธคำขอ",
    editQuote: "แก้ไขใบเสนอราคา",
    startWork: "เริ่มทำงาน",
    submitWip: "ส่งงานให้ตรวจ",
    submitRevision: "ส่งงานที่แก้แล้ว",
    deliver: "ส่งไฟล์จริง",
    waitingClient: "รอลูกค้าตอบกลับ",
    markComplete: "ยืนยันรับงาน",
    requestRevision: "ขอแก้ไข",
  },

  dashboard: {
    greeting: "สวัสดี",
    subtitle: "นี่คือภาพรวมงานของคุณวันนี้",
    newRequests: "คำขอใหม่",
    inProgress: "กำลังทำ",
    dueSoon: "ใกล้ครบกำหนด",
    monthRevenue: "รายได้เดือนนี้",
    needsAttention: "ต้องจัดการ",
    needsAttentionEmpty: "ไม่มีงานค้างที่ต้องจัดการ เยี่ยมมาก",
    recentActivity: "ความเคลื่อนไหวล่าสุด",
    quotaTitle: "การใช้งานแพ็กเกจ Free",
    quotaOrders: "งานที่รับพร้อมกัน",
    quotaStorage: "พื้นที่เก็บไฟล์",
    quotaServices: "เมนูรับงาน",
    shopLink: "ลิงก์หน้าร้านของคุณ",
    upgradeHint: "อัปเกรดเป็น Pro เพื่อรับงานไม่จำกัดและเปิดแจ้งเตือนทันที",
    overQuota: "เกินโควตาแพ็กเกจ — รับงานใหม่เพิ่มไม่ได้จนกว่าจะปิดงานเดิมหรืออัปเกรด",
  },

  analytics: {
    desc: "ยอดเข้าชมหน้าร้าน อัตราการสั่งงาน และรายได้ย้อนหลัง",
    lockDesc: "ดูยอดเข้าชมหน้าร้าน อัตราการสั่งงาน และรายได้ย้อนหลัง",
    views: "ยอดเข้าชม",
    requests: "คำขอ",
    conversion: "อัตราการสั่ง",
    shopViews: "ยอดเข้าชมหน้าร้าน",
  },

  listings: {
    desc: "เปิดประมูล adopt และ YCH พร้อมระบบต่อเวลาอัตโนมัติเมื่อมีคนบิดช่วงท้าย",
    lockDesc: "ปิดประมูลแล้วผู้ชนะจะกลายเป็นออเดอร์ให้อัตโนมัติ",
    currentBid: "ราคาปัจจุบัน",
    price: "ราคา",
    bids: "การเสนอราคา",
    auction: "ประมูล",
    fixed: "ราคาตายตัว",
  },

  clients: {
    desc: "แท็ก โน้ตส่วนตัว และประวัติการสั่งงานของลูกค้าแต่ละคน",
    lockDesc: "ส่งข้อความหาลูกค้าเก่าทั้งหมดได้ในคลิกเดียวเมื่อเปิดรับงานรอบใหม่",
    orders: "งาน",
    tagRegular: "ลูกค้าประจำ",
    tagFastPay: "จ่ายไว",
    tagBigJob: "งานใหญ่",
    tagNew: "ลูกค้าใหม่",
  },

  calendar: {
    desc: "เห็นกำหนดส่งงานทั้งหมดในมุมมองเดือน วางแผนรับงานรอบถัดไปได้ง่ายขึ้น",
  },

  portfolio: {
    upload: "อัปโหลดผลงาน",
    storageNote:
      "ไฟล์ถูกย่อและแปลงเป็น WebP ในเบราว์เซอร์ก่อนอัปโหลด แล้วส่งตรงไป Blob storage โดยไม่ผ่านเซิร์ฟเวอร์",
  },

  payment: {
    scanHint: "สแกนเพื่อโอนเข้าบัญชีของครีเอเตอร์โดยตรง",
    noEscrowNote:
      "แพลตฟอร์มไม่ได้ถือเงินของคุณ เงินโอนจากธนาคารลูกค้าเข้าบัญชีครีเอเตอร์โดยตรง ระบบเพียงบันทึกและปลดล็อกไฟล์ส่งมอบเมื่อได้รับเงินครบ",
  },

  settings: {
    profile: "โปรไฟล์",
    payments: "การรับเงิน",
    signedInWithGoogle: "เข้าสู่ระบบด้วย Google",
    displayName: "ชื่อที่แสดง",
    handle: "ชื่อลิงก์ (handle)",
    shopStatusTitle: "สถานะการรับงาน",
    shopStatusDesc: "ข้อมูลชิ้นที่คนดูหน้าร้านมองหาเป็นอันดับแรก",
    themeTitle: "ธีมหน้าร้าน",
    themeDesc: "แพ็กเกจ Free เลือกได้ 3 ชุดสีสำเร็จรูป · Pro ปรับสีและฟอนต์เองได้ทั้งหมด",
    promptpayDesc: "ระบบสร้าง QR จากหมายเลขนี้ให้อัตโนมัติ เงินเข้าบัญชีคุณโดยตรง",
    promptpayLabel: "เบอร์โทร หรือ เลขบัตรประชาชน",
    noFeeNote:
      "แพลตฟอร์มไม่ได้ถือเงินของคุณและไม่หักเปอร์เซ็นต์จากออเดอร์ — เราเก็บเฉพาะค่าสมาชิกรายเดือนเท่านั้น",
    currentPlan: "แพ็กเกจปัจจุบัน",
    notifyInApp: "แจ้งเตือนในเว็บ",
    notifyInAppBody: "เปิดใช้งานอยู่",
    notifyEmail: "อีเมล",
    notifyEmailBody: "สรุปวันละ 1 ครั้ง · Pro ได้แบบทันที",
    notifyPushBody: "เด้งบนเบราว์เซอร์ทันทีที่มีงานเข้า แม้ปิดแท็บอยู่",
    notifyDiscordBody: "ส่งเข้าเซิร์ฟเวอร์ Discord ของคุณเองผ่าน webhook",
  },

  notification: {
    title: "การแจ้งเตือน",
    markAllRead: "อ่านทั้งหมด",
    empty: "ยังไม่มีการแจ้งเตือน",
  },

  locked: {
    title: "ฟีเจอร์นี้อยู่ในแพ็กเกจ Pro",
    cta: "ดูรายละเอียด Pro",
  },

  empty: {
    noResults: "ไม่พบผลลัพธ์",
  },
} as const;

/**
 * โครงสร้างของพจนานุกรม — ภาษาอื่นต้องมีคีย์ครบเท่ากัน (TS จะฟ้องถ้าขาดหรือเกิน)
 *
 * ต้องคลาย literal type ของ `as const` ออกเป็น string ก่อน
 * ไม่งั้นภาษาอังกฤษจะถูกบังคับให้มีข้อความเหมือนภาษาไทยเป๊ะ ๆ
 */
type Widen<T> = T extends string ? string : { -readonly [K in keyof T]: Widen<T[K]> };

export type Dictionary = Widen<typeof th>;

const en: Dictionary = {
  brand: {
    name: "com-mi",
    tagline: "Commission workflow that creators actually control",
  },

  common: {
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    delete: "Delete",
    back: "Back",
    next: "Next",
    close: "Close",
    confirm: "Confirm",
    search: "Search",
    filter: "Filter",
    all: "All",
    loading: "Loading…",
    copy: "Copy",
    copied: "Copied",
    share: "Share",
    viewAll: "View all",
    days: "days",
    day: "day",
    from: "From",
    perPiece: "per piece",
    optional: "optional",
    required: "required",
    upgrade: "Upgrade to Pro",
    proOnly: "Pro feature",
    signIn: "Sign in",
    signInWithGoogle: "Continue with Google",
    signOut: "Sign out",
    language: "Language",
    theme: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    themeSystem: "System",
    on: "On",
    yes: "Yes",
    no: "No",
  },

  nav: {
    explore: "Explore",
    pricing: "Pricing",
    dashboard: "Overview",
    orders: "My work",
    services: "Commission menu",
    listings: "Adopts / YCH",
    portfolio: "Portfolio",
    shop: "Shop page",
    clients: "Clients",
    calendar: "Calendar",
    analytics: "Analytics",
    inbox: "Notifications",
    settings: "Settings",
    myRequests: "My requests",
    menu: "Menu",
  },

  prototype: {
    requestSent: "Request sent — this is a prototype, nothing was saved",
    messageSent: "Message sent (prototype)",
    paymentRecorded: "Payment recorded (prototype)",
    actionDone: "Done (prototype)",
    notSavedNote: "Prototype only — nothing was saved",
  },

  error: {
    title: "Something went wrong",
    body: "Try again. If it keeps happening, send us the reference below.",
    retry: "Try again",
    notFoundBody: "We couldn't find that page. It may have moved, or the link has a typo.",
  },

  auth: {
    tosNotice: "By signing in you agree to our",
    and: "and",
    signedInAs: "Signed in as",
    finishSetup: "Finish setting up your shop →",
  },

  onboarding: {
    title: "Pick your shop link",
    subtitle: "This is the link you'll put in your bio — you can change it later.",
    hint: "Use a–z, 0–9 and _, 3–30 characters",
    available: "That one's available",
    format: "Only a–z, 0–9 and _ are allowed, 3–30 characters",
    reserved: "That name is reserved — try another",
    taken: "Someone already has that one",
    submit: "Use this name",
    canChange: "You can change this later in settings, but the old link stops working immediately.",
  },

  legal: {
    terms: "Terms of Service",
    privacy: "Privacy Policy",
    placeholder: "The real document will be written before launch.",
  },

  landing: {
    heroTitle: "Run your commissions",
    heroTitleAccent: "from one link",
    heroSubtitle:
      "A shop page you can drop in your bio, plus a queue board, delivery flow, and payment tracking — so you can stop chasing work in DMs.",
    heroCta: "Create your shop — free",
    heroCtaSecondary: "See an example shop",
    heroNote: "Genuinely free. No card required.",
    featuresTitle: "Everything you need, in one place",
    features: {
      shopTitle: "A shop page that looks professional",
      shopBody:
        "Your menu, prices, current queue, and portfolio in a single link that looks good when shared to X or Discord.",
      queueTitle: "A queue board that keeps up",
      queueBody:
        "Drag cards between columns to change status. See at a glance what's due soon and what's waiting on the client.",
      briefTitle: "Brief forms you design yourself",
      briefBody:
        "Decide exactly what clients must fill in, with references attached up front. No more asking the same questions in DMs.",
      payTitle: "PromptPay QR built in",
      payBody:
        "Generate a QR from your own PromptPay ID. Money goes straight to your account — we never touch it.",
      notifyTitle: "Know the moment work arrives",
      notifyBody:
        "Browser push, email, or straight into your own Discord server. Stop refreshing to check for new requests.",
      adoptTitle: "Adopts & YCH auctions",
      adoptBody:
        "Run auctions with automatic time extension when someone bids late. The winner becomes an order instantly.",
    },
    howTitle: "Up and running in 10 minutes",
    how: {
      s1Title: "Sign in with Google",
      s1Body: "No new password to remember",
      s2Title: "Set up your menu",
      s2Body: "Start from a template and adjust the prices",
      s3Title: "Share your link",
      s3Body: "Put it in your bio and start taking work",
    },
    ctaTitle: "Ready to open your shop?",
    ctaBody: "The free plan covers the whole flow, from request to final delivery.",
  },

  pricing: {
    title: "Pricing",
    subtitle: "Clients never pay us. We only charge creators.",
    monthly: "Monthly",
    yearly: "Yearly",
    yearlyBadge: "2 months free",
    perMonth: "/month",
    perYear: "/year",
    currentPlan: "Current plan",
    choosePlan: "Choose this plan",
    startFree: "Start free",
    popular: "Recommended",
    faqTitle: "Common questions",
    noEscrowQ: "Does the platform hold my money?",
    noEscrowA:
      "No. Clients pay you directly via PromptPay or whichever method you set up. We only record the payment and keep delivery files locked until the full amount is marked received.",
    freeLimitQ: "Where does the free plan run out?",
    freeLimitA:
      "The free plan allows 5 concurrent orders, 5 menu items, and 12 portfolio pieces — comfortable for taking work casually. Pro is for people taking work continuously who want instant notifications.",
    downgradeQ: "If I cancel Pro, do I lose my data?",
    downgradeA:
      "No. Orders in progress finish normally. Menu items and portfolio pieces over the quota are just hidden, and reappear the moment you resubscribe.",
    freeBullets: {
      orders: "5 concurrent orders",
      services: "5 menu items",
      portfolio: "12 portfolio pieces",
      storage: "300 MB of file storage",
      noEscrow: "Money goes straight to you — no cut of your orders",
    },
    proBullets: {
      orders: "Unlimited orders",
      notify: "Instant push + Discord alerts",
      auctions: "Adopts / YCH auctions",
      theme: "Custom shop theme",
      analytics: "Analytics + client CRM",
    },
  },

  compare: {
    groups: {
      shop: "Shop page",
      menu: "Menu and intake",
      notify: "Notifications",
      adopts: "Adopts / YCH and clients",
      other: "Other",
    },
    rows: {
      shop: "Public shop page with your own link",
      portfolio: "Portfolio pieces",
      theme: "Custom theme and colours",
      badge: "Remove platform badge",
      services: "Commission menu items",
      active: "Concurrent orders",
      form: "Brief form",
      milestone: "Milestones and split deposits",
      inapp: "In-app notifications",
      email: "Email",
      push: "Browser push",
      discord: "Into your Discord server",
      listing: "Fixed-price listings",
      auction: "Auctions with anti-snipe",
      waitlist: "Broadcast to your waitlist",
      crm: "Client CRM (tags, notes, blacklist)",
      storage: "File storage",
      filesize: "Max file size",
      retention: "Delivery file retention",
      analytics: "Analytics and data export",
    },
    values: {
      unlimited: "Unlimited",
      presets3: "3 presets",
      fullyCustom: "Fully custom",
      dailyDigest: "Daily digest",
      instant: "Instant",
      days90: "90 days",
      forever: "Forever",
    },
  },

  plan: {
    free: "Free",
    pro: "Pro",
    studio: "Studio",
    freeDesc: "For taking work now and then",
    proDesc: "For taking work continuously",
    studioDesc: "For teams and studios",
  },

  shopStatus: {
    open: "Open for work",
    closed: "Closed",
    waitlist: "Waitlist open",
    vacation: "On break",
  },

  creator: {
    queueCount: "In queue",
    avgDelivery: "Avg. delivery",
    completed: "Delivered",
    rating: "Rating",
    menuTitle: "Commission menu",
    portfolioTitle: "Portfolio",
    reviewsTitle: "Client reviews",
    tosTitle: "Terms of service",
    orderNow: "Order",
    viewMenu: "View menu",
    notifyMe: "Notify me when open",
    notifyMeDone: "We'll let you know when slots open",
    joinWaitlist: "Join the waitlist",
    noReviews: "No reviews yet",
    reviewCount: "reviews",
    slotsLeft: "{n} slots left",
    fullyBooked: "Fully booked",
    poweredBy: "Made with",
  },

  service: {
    startingAt: "From",
    deliveryIn: "Delivery in",
    revisions: "Revisions",
    times: "included",
    whatYouGet: "What you get",
    addons: "Add-ons",
    tier: "Detail level",
    total: "Total",
    orderThis: "Send request",
    instantOrder: "Instant order",
    customProposal: "Quote required",
    instantOrderHint: "Fixed price — pay and join the queue right away",
    customProposalHint: "The creator reviews your brief and sends a quote",
    stepPackage: "Choose package",
    stepBrief: "Fill in the brief",
    stepConfirm: "Confirm request",
    acceptTos: "I have read and accept the terms of service",
    submitRequest: "Send request",
    draftSaved: "Draft saved automatically",
    tiersLabel: "tiers",
    addonsLabel: "add-ons",
    addService: "Add service",
    limitReached: "You've used all {n} menu slots — upgrade to Pro for unlimited services",
  },

  brief: {
    character: "Character or OC name",
    mood: "Mood or atmosphere",
    detail: "Anything else we should know",
    avoid: "Anything to avoid?",
    referenceFiles: "Reference files",
    dropzone: "Drag files here, or click to choose",
    dropzoneHint: "Resized and converted to WebP in your browser before upload",
    signInNote: "You'll sign in with Google before sending — nothing you typed will be lost.",
  },

  order: {
    title: "My work",
    code: "Order",
    client: "Client",
    creator: "Creator",
    service: "Service",
    total: "Total",
    paid: "Paid",
    remaining: "Remaining",
    dueIn: "Due in",
    overdue: "Overdue",
    dueToday: "Due today",
    revisionsUsed: "Revisions used",
    boardView: "Board",
    listView: "List",
    empty: "Nothing in this column",
    emptyAll: "No orders yet",
    emptyAllHint: "Share your shop link to start taking work",
    timeline: "Activity",
    files: "Files",
    references: "Client references",
    wip: "Work in progress",
    finalFiles: "Delivery files",
    lockedUntilPaid: "Unlocks when payment is complete",
    brief: "Client brief",
    privateNote: "Private note",
    privateNoteHint: "The client cannot see this",
    payment: "Payment",
    showQr: "Show PromptPay QR",
    markPaid: "Mark as received",
    writeMessage: "Write a message…",
    send: "Send",
    milestones: "Milestones",
    milestonesDesc: "Split the job into stages with their own deposits and due dates",
    systemEvent: "System",
    noQuoteYet: "No quote sent yet",
    needsQuote: "Needs quote",
    fullyPaid: "Fully paid",
    moveTo: "Move to…",
    daysLate: "{n}d late",
    daysLeft: "{n}d left",
  },

  orderStatus: {
    requested: "New request",
    reviewing: "Reviewing",
    quoted: "Quote sent",
    accepted: "Accepted",
    in_progress: "In progress",
    in_review: "Client reviewing",
    revision_requested: "Revision requested",
    delivered: "Delivered",
    completed: "Completed",
    declined: "Declined",
    cancelled: "Cancelled",
    expired: "Expired",
  },

  orderAction: {
    sendQuote: "Send quote",
    decline: "Decline request",
    editQuote: "Edit quote",
    startWork: "Start work",
    submitWip: "Submit for review",
    submitRevision: "Submit revision",
    deliver: "Deliver final files",
    waitingClient: "Waiting on the client",
    markComplete: "Confirm delivery",
    requestRevision: "Request a revision",
  },

  dashboard: {
    greeting: "Hi",
    subtitle: "Here's where your work stands today",
    newRequests: "New requests",
    inProgress: "In progress",
    dueSoon: "Due soon",
    monthRevenue: "Revenue this month",
    needsAttention: "Needs attention",
    needsAttentionEmpty: "Nothing waiting on you. Nice.",
    recentActivity: "Recent activity",
    quotaTitle: "Free plan usage",
    quotaOrders: "Concurrent orders",
    quotaStorage: "File storage",
    quotaServices: "Menu items",
    shopLink: "Your shop link",
    upgradeHint: "Upgrade to Pro for unlimited orders and instant notifications",
    overQuota: "Over your plan limit — finish existing work or upgrade to take more",
  },

  analytics: {
    desc: "Shop views, request conversion, and revenue over time",
    lockDesc: "See shop views, request conversion, and revenue over time",
    views: "Shop views",
    requests: "Requests",
    conversion: "Conversion",
    shopViews: "Shop views",
  },

  listings: {
    desc: "Run adopt and YCH auctions with automatic time extension on late bids",
    lockDesc: "When an auction closes, the winner automatically becomes an order",
    currentBid: "Current bid",
    price: "Price",
    bids: "bids",
    auction: "Auction",
    fixed: "Fixed",
  },

  clients: {
    desc: "Tags, private notes, and order history for every client",
    lockDesc: "Message every past client in one click when you open new slots",
    orders: "orders",
    tagRegular: "Regular",
    tagFastPay: "Pays fast",
    tagBigJob: "Big jobs",
    tagNew: "New client",
  },

  calendar: {
    desc: "See every delivery deadline in a month view so you can plan your next batch",
  },

  portfolio: {
    upload: "Upload work",
    storageNote:
      "Files are resized and converted to WebP in your browser, then uploaded straight to Blob storage without passing through the server.",
  },

  payment: {
    scanHint: "Scan to pay the creator directly",
    noEscrowNote:
      "We never hold your money. Funds move bank-to-bank straight to the creator; we only record the payment and unlock the delivery files once it's complete.",
  },

  settings: {
    profile: "Profile",
    payments: "Payments",
    signedInWithGoogle: "Signed in with Google",
    displayName: "Display name",
    handle: "Handle",
    shopStatusTitle: "Shop status",
    shopStatusDesc: "The first thing visitors look for",
    themeTitle: "Shop theme",
    themeDesc: "Free includes 3 presets · Pro unlocks full colour and font control",
    promptpayDesc: "We generate the QR from this number. Money goes straight to your account.",
    promptpayLabel: "Phone number or national ID",
    noFeeNote:
      "We never hold your money and take no cut of your orders — we only charge the subscription.",
    currentPlan: "Current plan",
    notifyInApp: "In-app notifications",
    notifyInAppBody: "Enabled",
    notifyEmail: "Email",
    notifyEmailBody: "Daily digest · Pro sends instantly",
    notifyPushBody: "Fires the moment work arrives, even with the tab closed",
    notifyDiscordBody: "Posts into your own Discord server via webhook",
  },

  notification: {
    title: "Notifications",
    markAllRead: "Mark all read",
    empty: "No notifications yet",
  },

  locked: {
    title: "This is a Pro feature",
    cta: "See what Pro includes",
  },

  empty: {
    noResults: "No results",
  },
};

const DICTIONARIES: Record<Locale, Dictionary> = { th, en };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES.th;
}

/** แทนที่ตัวแปรในสตริง เช่น t.creator.slotsLeft → "เหลืออีก {n} คิว" */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
}
