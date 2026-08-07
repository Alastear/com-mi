import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:py-8">
      <Skeleton className="h-6 w-40" />
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="h-24" />
        ))}
      </div>
      <Card className="mt-6 h-80" />
    </div>
  );
}
