import type { Metadata } from "next";
import { PricingClient } from "./pricing-client";

export const metadata: Metadata = {
  title: "ราคา / Pricing",
  description:
    "ลูกค้าที่มาสั่งงานใช้ฟรีเสมอ เราเก็บค่าบริการจากครีเอเตอร์เท่านั้น — Free และ Pro",
};

export default function PricingPage() {
  return <PricingClient />;
}
