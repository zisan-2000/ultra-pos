// app/dashboard/shops/new/page.tsx

import ShopFormClient from "../ShopFormClient";
import { handleCreateShop } from "./actions";

export default async function NewShopPage() {
  const backHref = "/dashboard/shops";

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">নতুন দোকান যোগ করুন</h1>
        <p className="text-gray-600 mt-2">দোকানের নাম, ব্যবসার ধরন, ঠিকানা ও ফোন দ্রুত যুক্ত করুন</p>
      </div>

      <ShopFormClient backHref={backHref} action={handleCreateShop} />
    </div>
  );
}
