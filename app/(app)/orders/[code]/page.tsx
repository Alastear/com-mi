import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderDetail } from "@/components/app/order-detail";
import { getOrder, orders } from "@/lib/mock/data";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const order = getOrder(code);
  return { title: order ? `#${order.code} — ${order.serviceTitle}` : "404" };
}

export function generateStaticParams() {
  return orders.map((o) => ({ code: o.code }));
}

export default async function OrderPage({ params }: Props) {
  const { code } = await params;
  const order = getOrder(code);
  if (!order) notFound();

  return <OrderDetail order={order} />;
}
