// app/page.tsx

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="p-6 space-y-6">
      {/* Dashboard cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">আজকের বিক্রি</p>
          <p className="mt-2 text-2xl font-semibold text-primary">৳ ১২,৪০০</p>
        </Card>

        <Card className="p-4">
          <p className="text-sm text-muted-foreground">খরচ</p>
          <p className="mt-2 text-2xl font-semibold text-destructive">
            ৳ ৩,২০০
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-sm text-muted-foreground">ক্যাশ ইন</p>
          <p className="mt-2 text-2xl font-semibold text-success">৳ ৯,২০০</p>
        </Card>
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        <Button>নতুন বিক্রি</Button>
        <Button variant="default">প্রোডাক্ট লিস্ট</Button>
        <Button variant="destructive">ডিলিট</Button>
      </div>
    </main>
  );
}
