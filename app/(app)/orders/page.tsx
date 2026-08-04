import { OrderBoard } from "@/components/app/order-board";
import { orders } from "@/lib/mock/data";

export default function OrdersPage() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:py-8">
      <OrderBoard orders={orders} />
    </div>
  );
}
